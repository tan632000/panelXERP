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

/**
 * The task's worked example on one item X with 10 on hand, then the decimal case, against the
 * real Postgres of the compose stack. Each step asserts the exact reservations and the orders
 * the step reports as changed.
 */
describeWithDatabase('ReservationService (real Postgres)', () => {
  let db: InventoryDb;
  let kit: ReservationKit;

  beforeAll(async () => {
    db = await openInventoryDb();
    kit = reservationKit(db);
  });

  afterAll(async () => {
    await kit?.cleanup();
    await db?.close();
  });

  const stockOf = async (itemId: number, quantity: string) => {
    await db.post({
      documentType: 'spec_opening',
      documentId: itemId,
      lines: [
        {
          itemId,
          movementType: StockMovementType.RECEIPT,
          quantity,
          unitCost: 1000,
        },
      ],
    });
  };

  it('reserves, allocates and releases X by delivery date as the worked example says', async () => {
    const x = await db.createItem();
    await stockOf(x, '10');

    // 1. Three orders, each taking min(available, shortage).
    const o1 = await kit.createOrder({
      deliveryDate: '2026-11-05',
      bom: [{ itemId: x, perPanel: '6' }],
    });
    const o2 = await kit.createOrder({
      deliveryDate: '2026-11-10',
      bom: [{ itemId: x, perPanel: '6' }],
    });
    const o3 = await kit.createOrder({ bom: [{ itemId: x, perPanel: '4' }] });
    expect(o1.change.orderIds).toEqual([o1.orderId]);
    expect(o2.change.orderIds).toEqual([o2.orderId]);
    expect(o3.change.orderIds).toEqual([]);
    expect(await kit.reservationsOf(x)).toEqual({
      [o1.orderId]: '6',
      [o2.orderId]: '4',
    });

    // 2. +5 arrives: O2 first (earlier date), then O3 (no date).
    const received = await kit.receive(x, '5');
    expect(received.orderIds).toEqual([o2.orderId, o3.orderId]);
    expect(await kit.reservationsOf(x)).toEqual({
      [o1.orderId]: '6',
      [o2.orderId]: '6',
      [o3.orderId]: '3',
    });
    expect(await kit.balanceOf(x)).toEqual({
      onHand: '15',
      reserved: '15',
      sum: '15',
    });

    // 3. O1 cancelled: its 6 go back, O3 takes the 1 it still lacks.
    const cancelled = await kit.cancel(o1.orderId);
    expect(cancelled.orderIds).toEqual([o1.orderId, o3.orderId]);
    expect(await kit.reservationsOf(x)).toEqual({
      [o2.orderId]: '6',
      [o3.orderId]: '4',
    });
    expect(await kit.balanceOf(x)).toEqual({
      onHand: '15',
      reserved: '10',
      sum: '10',
    });
  });

  it('reserves exactly 0.3 of 0.1 per panel over 3 panels from receipts of 0.1 and 0.2', async () => {
    const q = await db.createItem();
    const o4 = await kit.createOrder({
      panels: 3,
      bom: [{ itemId: q, perPanel: '0.1' }],
    });
    expect(o4.change.orderIds).toEqual([]);

    expect((await kit.receive(q, '0.1')).orderIds).toEqual([o4.orderId]);
    expect((await kit.receive(q, '0.2')).orderIds).toEqual([o4.orderId]);
    expect(await kit.reservationsOf(q)).toEqual({ [o4.orderId]: '0.3' });
    expect(await kit.alerts.shortItemCount(o4.orderId)).toBe(0);
    // Nothing more to give: a further receipt stays free.
    expect((await kit.receive(q, '0.5')).orderIds).toEqual([]);

    // 0.1 issued out of the 0.3 reserved: 0.3 − 0.1 − 0.2 is exactly 0, where float
    // arithmetic leaves 5.55e-17 and would call the order short.
    await db.post({
      documentType: 'spec_issue',
      documentId: q,
      lines: [
        {
          itemId: q,
          movementType: StockMovementType.ISSUE,
          quantity: '-0.1',
          orderId: o4.orderId,
        },
      ],
    });
    expect(await kit.reservationsOf(q)).toEqual({ [o4.orderId]: '0.2' });
    expect(await kit.alerts.shortItemCount(o4.orderId)).toBe(0);
    expect((await kit.receive(q, '0.1')).orderIds).toEqual([]);
  });

  it('finds no shortage where float subtraction would leave a sliver: 0.4 − 0.1 issued − 0.3 reserved', async () => {
    const r = await db.createItem();
    const order = await kit.createOrder({
      panels: 4,
      bom: [{ itemId: r, perPanel: '0.1' }],
    });
    await kit.receive(r, '0.4');
    await db.post({
      documentType: 'spec_issue',
      documentId: r,
      lines: [
        {
          itemId: r,
          movementType: StockMovementType.ISSUE,
          quantity: '-0.1',
          orderId: order.orderId,
        },
      ],
    });

    expect(await kit.reservationsOf(r)).toEqual({ [order.orderId]: '0.3' });
    // In float, 0.4 − 0.1 − 0.3 is 5.55e-17: the order would count as short.
    expect(await kit.alerts.shortItemCount(order.orderId)).toBe(0);
  });

  it('gives preferred orders first, then shrinks in exactly the reverse order', async () => {
    const y = await db.createItem();
    const early = await kit.createOrder({
      deliveryDate: '2026-11-01',
      bom: [{ itemId: y, perPanel: '2' }],
    });
    const late = await kit.createOrder({
      deliveryDate: '2026-12-01',
      bom: [{ itemId: y, perPanel: '2' }],
    });
    await stockOf(y, '2');

    const preferred = await db.dataSource.transaction((manager) =>
      kit.reservations.allocate(manager, [y], [late.orderId]),
    );
    expect(preferred.orderIds).toEqual([late.orderId]);
    expect(await kit.reservationsOf(y)).toEqual({ [late.orderId]: '2' });

    await stockOf(y, '2');
    await db.dataSource.transaction((manager) =>
      kit.reservations.allocate(manager, [y]),
    );
    expect(await kit.reservationsOf(y)).toEqual({
      [early.orderId]: '2',
      [late.orderId]: '2',
    });

    // Down to 3 reserved: the lowest priority (latest delivery) gives back first.
    const shrunk = await db.dataSource.transaction((manager) =>
      kit.reservations.deallocate(manager, y, '3'),
    );
    expect(shrunk.orderIds).toEqual([late.orderId]);
    expect(await kit.reservationsOf(y)).toEqual({
      [early.orderId]: '2',
      [late.orderId]: '1',
    });
  });

  it('removes a reservation an issue takes all of, and one deallocate empties', async () => {
    const v = await db.createItem();
    await stockOf(v, '6');
    const early = await kit.createOrder({
      deliveryDate: '2026-11-01',
      bom: [{ itemId: v, perPanel: '3' }],
    });
    const late = await kit.createOrder({
      deliveryDate: '2026-12-01',
      bom: [{ itemId: v, perPanel: '3' }],
    });

    // Issued exactly what the early order holds: its row goes, it does not reach 0.
    await db.post({
      documentType: 'spec_issue',
      documentId: v,
      lines: [
        {
          itemId: v,
          movementType: StockMovementType.ISSUE,
          quantity: '-3',
          orderId: early.orderId,
        },
      ],
    });
    expect(await kit.reservationsOf(v)).toEqual({ [late.orderId]: '3' });

    // Down to 0 reserved: the late order gives everything back.
    const emptied = await db.dataSource.transaction((manager) =>
      kit.reservations.deallocate(manager, v, '0'),
    );
    expect(emptied.orderIds).toEqual([late.orderId]);
    expect(await kit.reservationsOf(v)).toEqual({});
    expect(await kit.balanceOf(v)).toEqual({
      onHand: '3',
      reserved: '0',
      sum: '0',
    });
  });

  it('consumes the order’s reservation when stock is issued for it', async () => {
    const z = await db.createItem();
    await stockOf(z, '5');
    const order = await kit.createOrder({
      bom: [{ itemId: z, perPanel: '3' }],
    });

    const issued = await db.post({
      documentType: 'spec_issue',
      documentId: z,
      lines: [
        {
          itemId: z,
          movementType: StockMovementType.ISSUE,
          quantity: '-2',
          orderId: order.orderId,
        },
      ],
    });
    expect(issued.changedOrderIds).toEqual([order.orderId]);
    expect(await kit.reservationsOf(z)).toEqual({ [order.orderId]: '1' });
    expect(await kit.balanceOf(z)).toEqual({
      onHand: '3',
      reserved: '1',
      sum: '1',
    });
    expect(await kit.alerts.shortItemCount(order.orderId)).toBe(0);
  });
});
