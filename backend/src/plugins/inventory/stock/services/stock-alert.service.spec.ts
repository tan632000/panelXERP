import { Notification } from '@kernel/core/audit/notification.entity';
import { NotificationService } from '@kernel/core/audit/notification.service';

import {
  describeWithDatabase,
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import {
  STOCK_LOW_EVENT,
  StockAlertService,
} from '@plugins/inventory/stock/services/stock-alert.service';

import type { DataSource } from 'typeorm';

interface NoticeRow {
  dedupe_key: string | null;
  status: string;
  role_codes: string[];
  required_scope: string;
}

describeWithDatabase('StockAlertService (real Postgres)', () => {
  let db: InventoryDb;
  let alerts: StockAlertService;

  beforeAll(async () => {
    db = await openInventoryDb();
    // Emit, find and release use only the notification table.
    const notifications = new NotificationService(
      db.dataSource.getRepository(Notification),
      null as never,
      null as never,
    );
    alerts = new StockAlertService(db.dataSource, notifications);
  });

  afterAll(async () => {
    await db?.close();
  });

  const noticesOf = (itemId: number): Promise<NoticeRow[]> =>
    db.dataSource.query(
      `SELECT dedupe_key, status, role_codes, required_scope FROM notifications
       WHERE event_type = $1 AND (payload->>'itemId')::int = $2 ORDER BY id`,
      [STOCK_LOW_EVENT, itemId],
    );

  const move = async (
    itemId: number,
    movementType: StockMovementType.RECEIPT | StockMovementType.ISSUE,
    quantity: string,
    unitCost?: number,
  ) => {
    const { itemIds } = await db.post({
      documentType: 'spec',
      documentId: 1,
      lines: [{ itemId, movementType, quantity, unitCost }],
    });
    await alerts.afterCommit(itemIds);
  };

  it('follows the worked example: one notice at 11 < 12, released at 14, a second at 11.5', async () => {
    const itemId = await db.createItem();
    await move(itemId, StockMovementType.RECEIPT, '10', 100000);
    await move(itemId, StockMovementType.RECEIPT, '5', 130000);
    await db.dataSource.query(`UPDATE items SET min_stock = 12 WHERE id = $1`, [
      itemId,
    ]);

    // 3. issue 4 → available 11 < 12.
    await move(itemId, StockMovementType.ISSUE, '-4');
    let notices = await noticesOf(itemId);
    expect(notices).toEqual([
      {
        dedupe_key: `item:${itemId}`,
        status: 'open',
        role_codes: ['purchasing'],
        required_scope: 'stock:read',
      },
    ]);

    // Still below: no second notice for the same drop.
    await alerts.afterCommit([itemId]);
    expect(await noticesOf(itemId)).toHaveLength(1);

    // 4. receipt 3 → 14 ≥ 12: released, the record stays open for its reader.
    await move(itemId, StockMovementType.RECEIPT, '3', 123457);
    notices = await noticesOf(itemId);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ dedupe_key: null, status: 'open' });

    // 5. issue 2.5 → 11.5 < 12: a second notice.
    await move(itemId, StockMovementType.ISSUE, '-2.5');
    notices = await noticesOf(itemId);
    expect(notices.map((n) => n.dedupe_key)).toEqual([null, `item:${itemId}`]);
  });

  it('compares available stock, not on hand: reserved stock counts as gone', async () => {
    const itemId = await db.createItem({ minStock: 5 });
    await move(itemId, StockMovementType.RECEIPT, '6', 100);
    expect(await noticesOf(itemId)).toHaveLength(0);

    await db.dataSource.query(
      `UPDATE stock_balances SET reserved = 2 WHERE item_id = $1`,
      [itemId],
    );
    await alerts.afterCommit([itemId]);
    expect(await noticesOf(itemId)).toHaveLength(1);
  });

  it('raises nothing for an item without a minimum', async () => {
    const itemId = await db.createItem();
    await move(itemId, StockMovementType.RECEIPT, '1', 100);
    expect(await noticesOf(itemId)).toHaveLength(0);
  });

  it('raises one notice when two commits evaluate the same drop at once', async () => {
    const itemId = await db.createItem({ minStock: 1 });
    await Promise.all([
      alerts.afterCommit([itemId]),
      alerts.afterCommit([itemId]),
      alerts.afterCommit([itemId]),
    ]);
    expect(await noticesOf(itemId)).toHaveLength(1);
  });

  it('never throws when the notice cannot be sent or the stock cannot be read', async () => {
    const itemId = await db.createItem({ minStock: 1 });
    const failing = {
      findOpenByDedupeKey: jest.fn().mockResolvedValue(null),
      emit: jest.fn().mockRejectedValue(new Error('bell down')),
      releaseDedupeKey: jest.fn(),
    };
    const broken = new StockAlertService(db.dataSource, failing as never);
    await expect(broken.afterCommit([itemId])).resolves.toBeUndefined();
    expect(failing.emit).toHaveBeenCalledTimes(1);

    const unreadable = new StockAlertService(
      {
        query: jest.fn().mockRejectedValue(new Error('db down')),
      } as unknown as DataSource,
      failing as never,
    );
    await expect(unreadable.afterCommit([itemId])).resolves.toBeUndefined();
  });
});
