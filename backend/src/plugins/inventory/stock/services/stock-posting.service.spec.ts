import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import {
  describeWithDatabase,
  expectLedgerBalanced,
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import {
  STOCK_ITEM_REFERENCE_CHECK,
  StockItemReferenceService,
} from '@plugins/inventory/stock/services/stock-item-reference.service';

import type {
  StockPostingLine,
  StockPostingRequest,
} from '@plugins/inventory/stock/services/stock-posting.service';

const DOC = { documentType: 'spec', documentId: 1 };

const receipt = (
  itemId: number,
  quantity: string | number,
  unitCost: number,
): StockPostingLine => ({
  itemId,
  movementType: StockMovementType.RECEIPT,
  quantity,
  unitCost,
});

const issue = (
  itemId: number,
  quantity: string | number,
): StockPostingLine => ({
  itemId,
  movementType: StockMovementType.ISSUE,
  quantity: `-${quantity}`,
});

const request = (...lines: StockPostingLine[]): StockPostingRequest => ({
  ...DOC,
  lines,
});

describeWithDatabase('StockPostingService (real Postgres)', () => {
  let db: InventoryDb;
  const touched: number[] = [];

  beforeAll(async () => {
    db = await openInventoryDb();
  });

  afterEach(async () => {
    // Invariant (e): every item a spec touched still balances against its own ledger.
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

  const balanceOf = async (itemId: number) => {
    const [row]: Array<{ on_hand: string; value: string }> =
      await db.dataSource.query(
        `SELECT on_hand::text, value::text FROM stock_balances WHERE item_id = $1`,
        [itemId],
      );
    return row ?? null;
  };

  describe('the worked example, posted one document at a time', () => {
    let itemId: number;

    beforeAll(async () => {
      itemId = await newItem();
    });

    const lastMovement = async () => {
      const [row]: Array<Record<string, string>> = await db.dataSource.query(
        `SELECT movement_type, quantity::text, unit_cost::text, value::text,
                on_hand_after::text, avg_cost_after::text
         FROM stock_movements WHERE item_id = $1 ORDER BY id DESC LIMIT 1`,
        [itemId],
      );
      return row;
    };

    it('1–2. receipts raise on hand and value at their prices', async () => {
      await db.post(request(receipt(itemId, 10, 100000)));
      await db.post(request(receipt(itemId, 5, 130000)));
      expect(await balanceOf(itemId)).toEqual({
        on_hand: '15.000',
        value: '1650000.00',
      });
      expect((await lastMovement()).avg_cost_after).toBe('110000.0000');
    });

    it('3. an issue leaves at the average', async () => {
      await db.post(request(issue(itemId, 4)));
      expect(await balanceOf(itemId)).toEqual({
        on_hand: '11.000',
        value: '1210000.00',
      });
      expect(await lastMovement()).toMatchObject({
        movement_type: 'issue',
        quantity: '-4.000',
        unit_cost: '110000.0000',
        value: '-440000.00',
      });
    });

    it('4–5. a fractional issue costs at the rounded average', async () => {
      await db.post(request(receipt(itemId, 3, 123457)));
      expect((await lastMovement()).avg_cost_after).toBe('112883.6429');
      await db.post(request(issue(itemId, '2.5')));
      expect(await lastMovement()).toEqual({
        movement_type: 'issue',
        quantity: '-2.500',
        unit_cost: '112883.6429',
        value: '-282209.00',
        on_hand_after: '11.500',
        avg_cost_after: '112883.6522',
      });
    });

    it('6. refuses an issue of 12 that would leave −0.5, writing nothing', async () => {
      const before = await db.totals(itemId);
      await expect(db.post(request(issue(itemId, 12)))).rejects.toThrow(
        new ConflictException(`Item ${db.tag}-1 would leave -0.5 on hand.`),
      );
      expect(await db.totals(itemId)).toEqual(before);
    });

    it('7. the issue emptying the item takes the whole remaining value', async () => {
      await db.post(request(issue(itemId, '11.5')));
      expect(await balanceOf(itemId)).toEqual({
        on_hand: '0.000',
        value: '0.00',
      });
      expect(await lastMovement()).toMatchObject({
        value: '-1298162.00',
        avg_cost_after: '112883.6522',
      });
    });
  });

  it('8. posts exact decimals: 0.1 + 0.2 received, 0.3 issued leaves nothing', async () => {
    const itemId = await newItem();
    await db.post(
      request(receipt(itemId, 0.1, 1000), receipt(itemId, 0.2, 1000)),
    );
    await db.post(request(issue(itemId, '0.3')));
    expect(await balanceOf(itemId)).toEqual({
      on_hand: '0.000',
      value: '0.00',
    });

    const other = await newItem();
    await db.post(request(receipt(other, '1.005', 100)));
    expect(await balanceOf(other)).toEqual({
      on_hand: '1.005',
      value: '101.00',
    });
  });

  it('(c) a posting failing on its second line leaves the first line unposted', async () => {
    const first = await newItem();
    const second = await newItem();
    await db.post(request(receipt(first, 2, 500)));

    await expect(
      db.post(request(receipt(first, 5, 500), issue(second, 1))),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(await balanceOf(first)).toEqual({
      on_hand: '2.000',
      value: '1000.00',
    });
    expect(await balanceOf(second)).toBeNull();
  });

  it('(d) the database refuses a negative on hand written around the service', async () => {
    const itemId = await newItem();
    await db.post(request(receipt(itemId, 1, 100)));
    const failure: unknown = await db.dataSource
      .query<unknown>(
        `UPDATE stock_balances SET on_hand = -1 WHERE item_id = $1`,
        [itemId],
      )
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QueryFailedError);
    expect(
      (failure as QueryFailedError & { driverError: { code: string } })
        .driverError.code,
    ).toBe('23514');
  });

  it('refuses taking stock below what is reserved', async () => {
    const itemId = await newItem();
    await db.post(request(receipt(itemId, 5, 100)));
    await db.dataSource.query(
      `UPDATE stock_balances SET reserved = 3 WHERE item_id = $1`,
      [itemId],
    );
    await expect(db.post(request(issue(itemId, 3)))).rejects.toThrow(
      /would leave 2 on hand, below the 3 reserved/,
    );
    await db.post(request(issue(itemId, 2)));
    expect(await balanceOf(itemId)).toEqual({
      on_hand: '3.000',
      value: '300.00',
    });
  });

  it('refuses a deleted item with 409 and an unknown one with 404', async () => {
    const itemId = await newItem();
    await db.dataSource.query(
      `UPDATE items SET is_deleted = true, deleted_at = NOW() WHERE id = $1`,
      [itemId],
    );
    await expect(db.post(request(receipt(itemId, 1, 100)))).rejects.toThrow(
      ConflictException,
    );
    await expect(db.post(request(receipt(-1, 1, 100)))).rejects.toThrow(
      NotFoundException,
    );
    await db.dataSource.query(
      `UPDATE items SET is_deleted = false, deleted_at = NULL WHERE id = $1`,
      [itemId],
    );
  });

  it.each([
    ['a zero quantity', { quantity: 0 }],
    ['more than 3 decimals', { quantity: '0.0001' }],
    ['a receipt taking stock out', { quantity: -1 }],
    ['stock coming in without a cost', { unitCost: null }],
    ['a negative cost', { unitCost: -1 }],
  ])('refuses %s with 400', async (_label, override) => {
    const itemId = await newItem();
    await expect(
      db.post(request({ ...receipt(itemId, 1, 100), ...override })),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an issue that brings stock in', async () => {
    const itemId = await newItem();
    await expect(
      db.post(request({ ...issue(itemId, 1), quantity: 1 })),
    ).rejects.toThrow(BadRequestException);
  });

  it('records the document, order and actor on each movement', async () => {
    const itemId = await newItem();
    const actorId = await db.userId('storekeeper');
    const { itemIds, movementIds } = await db.post({
      documentType: 'stock_receipt',
      documentId: 7,
      actorId,
      lines: [
        {
          ...receipt(itemId, 1, 100),
          documentLineId: 70,
          orderId: 9,
          orderLineId: 90,
          reason: 'spec',
        },
      ],
    });
    expect(itemIds).toEqual([itemId]);
    const [row]: Array<Record<string, unknown>> = await db.dataSource.query(
      `SELECT document_type, document_id, document_line_id, order_id, order_line_id, reason, created_by
       FROM stock_movements WHERE id = $1`,
      [movementIds[0]],
    );
    expect(row).toEqual({
      document_type: 'stock_receipt',
      document_id: 7,
      document_line_id: 70,
      order_id: 9,
      order_line_id: 90,
      reason: 'spec',
      created_by: actorId,
    });
  });

  describe('item delete veto', () => {
    it('reports an item with stock history as referenced, a fresh one as not', async () => {
      const registry = new ReferenceCheckRegistry();
      new StockItemReferenceService(db.dataSource, registry).onModuleInit();

      const used = await newItem();
      const fresh = await newItem();
      await db.post(request(receipt(used, 1, 100)));

      expect(await registry.referencingItem(used)).toEqual([
        STOCK_ITEM_REFERENCE_CHECK,
      ]);
      expect(await registry.referencingItem(fresh)).toEqual([]);
    });
  });
});
