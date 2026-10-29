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
 * Reservations under concurrency against the real Postgres of the compose stack. The create
 * and cancel hooks run in their own transactions exactly as convert and cancel run them, the
 * sales rows of each order already written.
 */
describeWithDatabase('Reservation races (real Postgres)', () => {
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
  /** An open order written with nothing reserved yet, as a convert stands before its hook. */
  const writtenOrder = async (
    bom: Array<{ itemId: number; perPanel: string }>,
  ) => {
    const { orderId } = await kit.createOrder({ bom: [] });
    let lineNo = 0;
    for (const line of bom) {
      lineNo += 1;
      await db.dataSource.query(
        `INSERT INTO sales_order_bom_lines (line_id, item_id, item_code, item_name, item_unit, quantity)
         SELECT id, $2, $3, 'Race item', 'Cái', $4 FROM sales_order_lines WHERE order_id = $1`,
        [orderId, line.itemId, `R${line.itemId}-${lineNo}`, line.perPanel],
      );
    }
    return orderId;
  };
  const reserve = (orderId: number) =>
    db.dataSource.transaction((manager) =>
      kit.reservations.reserveForOrder(manager, orderId),
    );

  it('(a) never reserves more than on hand for two orders created together', async () => {
    const x = await db.createItem();
    await stockOf(x, '10');
    const first = await writtenOrder([{ itemId: x, perPanel: '8' }]);
    const second = await writtenOrder([{ itemId: x, perPanel: '8' }]);

    await Promise.all([reserve(first), reserve(second)]);

    const held = Object.values(await kit.reservationsOf(x)).sort();
    expect(held).toEqual(['2', '8']);
    expect(await kit.balanceOf(x)).toMatchObject({ reserved: '10', sum: '10' });
  });

  it('(b) leaves a cancelled order with nothing reserved while a receipt allocates alongside', async () => {
    for (let round = 0; round < 10; round += 1) {
      const x = await db.createItem();
      const o5 = await writtenOrder([{ itemId: x, perPanel: '3' }]);
      // Short of X, nothing of X reserved.
      expect(await kit.reservationsOf(x)).toEqual({});

      await Promise.all([kit.cancel(o5), kit.receive(x, '5')]);

      expect(await kit.reservationsOf(x)).toEqual({});
      const balance = await kit.balanceOf(x);
      expect(balance).toMatchObject({ onHand: '5', reserved: balance.sum });
      expect(balance.sum).toBe('0');
    }
  });

  it('(c) never deadlocks a create and a cancel sharing two items in opposite BOM order', async () => {
    for (let round = 0; round < 10; round += 1) {
      const x = await db.createItem();
      const y = await db.createItem();
      await stockOf(x, '4');
      await stockOf(y, '4');
      const b = await writtenOrder([
        { itemId: x, perPanel: '2' },
        { itemId: y, perPanel: '2' },
      ]);
      await reserve(b);
      const a = await writtenOrder([
        { itemId: y, perPanel: '3' },
        { itemId: x, perPanel: '3' },
      ]);

      const results = await Promise.allSettled([reserve(a), kit.cancel(b)]);
      const failures = results.filter((result) => result.status === 'rejected');
      expect(failures).toEqual([]);
      // B gave everything back; A ends with its 3 of each.
      expect(await kit.reservationsOf(x)).toEqual({ [a]: '3' });
      expect(await kit.reservationsOf(y)).toEqual({ [a]: '3' });
    }
  });

  it('(d) makes a cancel wait for the balance row of an item it never reserved', async () => {
    const x = await db.createItem();
    const order = await writtenOrder([{ itemId: x, perPanel: '2' }]);
    await db.dataSource.query(
      `INSERT INTO stock_balances (item_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [x],
    );

    const holder = db.dataSource.createQueryRunner();
    await holder.connect();
    let cancelling: Promise<unknown> | undefined;
    try {
      await holder.startTransaction();
      await holder.query(
        `SELECT item_id FROM stock_balances WHERE item_id = $1 FOR UPDATE`,
        [x],
      );
      const [{ pid }] = (await holder.query(
        `SELECT pg_backend_pid() AS pid`,
      )) as Array<{ pid: number }>;

      cancelling = kit.cancel(order);
      cancelling.catch(() => undefined);

      // Only a backend blocked by the holder counts, never another spec's waiting query.
      const deadline = Date.now() + 10_000;
      let waiting = '';
      while (!waiting && Date.now() < deadline) {
        const rows: Array<{ query: string }> = await db.dataSource.query(
          `SELECT query FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`,
          [pid],
        );
        waiting = rows[0]?.query ?? '';
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toMatch(/stock_balances/);
    } finally {
      await holder.rollbackTransaction().catch(() => undefined);
      await holder.release();
      await cancelling?.catch(() => undefined);
    }
    await expect(cancelling).resolves.toBeDefined();
  });
});
