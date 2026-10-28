import { ConflictException } from '@nestjs/common';

import {
  describeWithDatabase,
  expectLedgerBalanced,
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';

import type { StockPostingLine } from '@plugins/inventory/stock/services/stock-posting.service';

const DEADLOCK_DETECTED = '40P01';

const receipt = (itemId: number, quantity: number): StockPostingLine => ({
  itemId,
  movementType: StockMovementType.RECEIPT,
  quantity,
  unitCost: 1000,
});

const issue = (itemId: number, quantity: number): StockPostingLine => ({
  itemId,
  movementType: StockMovementType.ISSUE,
  quantity: -quantity,
});

const deadlocked = (results: Array<PromiseSettledResult<unknown>>) =>
  results.some(
    (result) =>
      result.status === 'rejected' &&
      (result.reason as { driverError?: { code?: string } }).driverError
        ?.code === DEADLOCK_DETECTED,
  );

describeWithDatabase(
  'StockPostingService under concurrency (real Postgres)',
  () => {
    let db: InventoryDb;
    const touched: number[] = [];

    beforeAll(async () => {
      db = await openInventoryDb();
    });

    afterEach(async () => {
      for (const itemId of touched) await expectLedgerBalanced(db, itemId);
    });

    afterAll(async () => {
      await db?.close();
    });

    const newItem = async () => {
      const id = await db.createItem();
      touched.push(id);
      return id;
    };

    it('(a) ten concurrent issues of 1 against 5 on hand: exactly five succeed', async () => {
      const itemId = await newItem();
      await db.post({
        documentType: 'spec',
        documentId: 1,
        lines: [receipt(itemId, 5)],
      });

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, index) =>
          db.post({
            documentType: 'spec',
            documentId: index + 2,
            lines: [issue(itemId, 1)],
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(5);
      expect(rejected).toHaveLength(5);
      for (const failure of rejected) {
        expect(failure.reason).toBeInstanceOf(ConflictException);
      }

      const [balance]: Array<{ on_hand: string; value: string }> =
        await db.dataSource.query(
          `SELECT on_hand::text, value::text FROM stock_balances WHERE item_id = $1`,
          [itemId],
        );
      expect(balance).toEqual({ on_hand: '0.000', value: '0.00' });
    });

    it('(b) postings over {A, B} and {B, A} at once never deadlock, round after round', async () => {
      const a = await newItem();
      const b = await newItem();

      for (let round = 0; round < 20; round += 1) {
        // Round 0 also races the creation of both balance rows.
        const results = await Promise.allSettled(
          Array.from({ length: 6 }, (_, index) =>
            db.post({
              documentType: 'spec',
              documentId: round * 10 + index,
              lines:
                index % 2 === 0
                  ? [receipt(a, 2), receipt(b, 2)]
                  : [receipt(b, 2), receipt(a, 2), issue(b, 1), issue(a, 1)],
            }),
          ),
        );

        expect(deadlocked(results)).toBe(false);
        expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      }
    });
  },
);
