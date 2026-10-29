import {
  describeWithDatabase,
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import {
  reservationKit,
  type ReservationKit,
} from '@plugins/inventory/material/reservation-db.helper-spec';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';

interface NoticeRow {
  event_type: string;
  status: string;
  dedupe_key: string | null;
  role_codes: string[];
  user_ids: number[];
  required_scope: string;
}

/**
 * Shortage notices through the worked example: after each step the alert service runs for the
 * orders the step changed, as the lifecycle's after-commit does.
 */
describeWithDatabase('ShortageAlertService (real Postgres)', () => {
  let db: InventoryDb;
  let kit: ReservationKit;
  let salesA: number;

  beforeAll(async () => {
    db = await openInventoryDb();
    kit = reservationKit(db);
    salesA = await db.userId('sales_a');
  });

  afterAll(async () => {
    await kit?.cleanup();
    await db?.close();
  });

  const noticesOf = (orderId: number): Promise<NoticeRow[]> =>
    db.dataSource.query(
      `SELECT event_type, status, dedupe_key, role_codes, user_ids, required_scope
         FROM notifications
        WHERE event_type LIKE 'inventory.order.short%'
          AND (payload->>'orderId')::int = $1
        ORDER BY event_type`,
      [orderId],
    );
  /** Open and still holding its dedupe slot: a further shortage would not raise another. */
  const outstanding = async (orderId: number) =>
    (await noticesOf(orderId))
      .filter((row) => row.status === 'open' && row.dedupe_key !== null)
      .map((row) => row.event_type);

  const create = async (spec: Parameters<ReservationKit['createOrder']>[0]) => {
    const made = await kit.createOrder(spec);
    await kit.alerts.afterCommit(
      [made.orderId, ...made.change.orderIds],
      made.change.itemIds,
    );
    return made.orderId;
  };

  it('tells purchasing and the owner once per short order, and releases on any order’s change', async () => {
    const x = await db.createItem();
    await db.post({
      documentType: 'spec_opening',
      documentId: x,
      lines: [
        {
          itemId: x,
          movementType: StockMovementType.RECEIPT,
          quantity: 10,
          unitCost: 1000,
        },
      ],
    });

    // 1. O1 fully reserved; O2 short 2; O3 short 4.
    const o1 = await create({
      deliveryDate: '2026-11-05',
      bom: [{ itemId: x, perPanel: '6' }],
    });
    const o2 = await create({
      deliveryDate: '2026-11-10',
      bom: [{ itemId: x, perPanel: '6' }],
    });
    const o3 = await create({ bom: [{ itemId: x, perPanel: '4' }] });

    expect(await noticesOf(o1)).toEqual([]);
    const both = ['inventory.order.short', 'inventory.order.short.owner'];
    expect(await outstanding(o2)).toEqual(both);
    expect(await outstanding(o3)).toEqual(both);
    const [toPurchasing, toOwner] = await noticesOf(o2);
    expect(toPurchasing).toMatchObject({
      role_codes: ['purchasing'],
      required_scope: 'material:read',
      dedupe_key: `order:${o2}`,
    });
    expect(toOwner).toMatchObject({ user_ids: [salesA], role_codes: [] });

    // Evaluating again raises nothing new.
    await kit.alerts.afterCommit([o2, o3], [x]);
    expect(await noticesOf(o2)).toHaveLength(2);

    // 2. +5: O2 covered (released), O3 still short 1.
    const received = await kit.receive(x, '5');
    await kit.alerts.afterCommit(received.orderIds, received.itemIds);
    expect(await outstanding(o2)).toEqual([]);
    expect(await noticesOf(o2)).toHaveLength(2);
    expect(await outstanding(o3)).toEqual(both);

    // 3. O1 cancelled: its stock covers O3, whose notices are released by O1's cancel.
    const cancelled = await kit.cancel(o1);
    await kit.alerts.afterCommit(
      [o1, ...cancelled.orderIds],
      cancelled.itemIds,
    );
    expect(await outstanding(o3)).toEqual([]);
  });

  it('closes the notices of a short order that is cancelled', async () => {
    const w = await db.createItem();
    const order = await create({ bom: [{ itemId: w, perPanel: '2' }] });
    expect(await outstanding(order)).toHaveLength(2);

    const cancelled = await kit.cancel(order);
    await kit.alerts.afterCommit(
      [order, ...cancelled.orderIds],
      cancelled.itemIds,
    );
    expect((await noticesOf(order)).map((row) => row.status)).toEqual([
      'resolved',
      'resolved',
    ]);
  });

  it('raises for 0.1 × 3 panels with nothing on hand and releases after 0.1 + 0.2 arrive', async () => {
    const q = await db.createItem();
    const o4 = await create({
      panels: 3,
      bom: [{ itemId: q, perPanel: '0.1' }],
    });
    expect(await outstanding(o4)).toHaveLength(2);

    for (const quantity of ['0.1', '0.2']) {
      const received = await kit.receive(q, quantity);
      await kit.alerts.afterCommit(received.orderIds, received.itemIds);
    }
    expect(await kit.alerts.shortItemCount(o4)).toBe(0);
    expect(await outstanding(o4)).toEqual([]);
  });
});
