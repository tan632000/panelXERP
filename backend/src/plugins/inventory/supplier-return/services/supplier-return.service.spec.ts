import { randomUUID } from 'crypto';

import { Decimal } from 'decimal.js';

import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import {
  describeWithDatabase,
  expectLedgerBalanced,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import {
  openSupplierReturnHarness,
  type SupplierReturnHarness,
} from '@plugins/inventory/supplier-return/supplier-return-db.helper-spec';

import type { Response } from 'supertest';

const exact = (text: string) => new Decimal(text).toFixed();

interface ReturnBody {
  id: number;
  code: string;
  lines: Array<Record<string, unknown>>;
}
const bodyOf = (res: { body: unknown }) => res.body as ReturnBody;

/**
 * Supplier returns against the real Postgres of the compose stack, over HTTP: the task's
 * worked example (values, reference values, reservations, order statuses), the last-unit and
 * clamp vectors with the ledger invariant, what a storekeeper is shown, and the races.
 */
describeWithDatabase('SupplierReturnService (real Postgres)', () => {
  // The races queue real transactions behind a held lock.
  jest.setTimeout(30_000);

  let h: SupplierReturnHarness;

  beforeAll(async () => {
    h = await openSupplierReturnHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  const stockOf = async (itemId: number) => {
    const totals = await h.db.totals(itemId);
    return { onHand: exact(totals.onHand), value: exact(totals.value) };
  };
  const lastMovement = async (itemId: number) => {
    const [row]: Array<{
      value: string;
      reference: string | null;
      avg: string;
    }> = await h.db.dataSource.query(
      `SELECT trim_scale(value)::text AS value,
                trim_scale(reference_value)::text AS reference,
                avg_cost_after::text AS avg
           FROM stock_movements WHERE item_id = $1 ORDER BY id DESC LIMIT 1`,
      [itemId],
    );
    return row;
  };
  const issueFreeStock = (itemId: number, quantity: string) =>
    h.db.post({
      documentType: 'spec_issue',
      documentId: itemId,
      lines: [
        {
          itemId,
          movementType: StockMovementType.ISSUE,
          quantity: `-${quantity}`,
        },
      ],
    });

  it('returns at the PO price, shrinks the lowest priority, reopens the PO line (steps 1–3)', async () => {
    const x = await h.db.createItem();
    const o1 = (
      await h.kit.createOrder({
        deliveryDate: '2026-11-05',
        bom: [{ itemId: x, perPanel: '8' }],
      })
    ).orderId;
    const o3 = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '6' }] })
    ).orderId;
    const po1 = await h.createPurchaseOrder([
      { itemId: x, quantity: '10', unitPrice: 100000 },
    ]);
    const po2 = await h.createPurchaseOrder([
      { itemId: x, quantity: '5', unitPrice: 130000 },
    ]);
    await h
      .receive(po1.id, [{ poLineId: po1.lineIds[0], quantity: 10 }])
      .expect(201);
    await h
      .receive(po2.id, [{ poLineId: po2.lineIds[0], quantity: 5 }])
      .expect(201);
    expect(await stockOf(x)).toEqual({ onHand: '15', value: '1650000' });
    expect(await h.kit.reservationsOf(x)).toEqual({ [o1]: '8', [o3]: '6' });

    // 1. 3 back on PO2: −390 000, not 3 × the average 110 000.
    const returned = await h
      .returnToSupplier(po2.id, [{ poLineId: po2.lineIds[0], quantity: 3 }])
      .expect(201);
    expect(bodyOf(returned).code).toMatch(/^XT_\d{4}_\d{4}$/);
    expectNoMoneyKeys(returned.body);
    expect(await lastMovement(x)).toEqual({
      value: '-390000',
      reference: '390000',
      avg: '105000.0000',
    });
    expect(await stockOf(x)).toEqual({ onHand: '12', value: '1260000' });
    // 14 reserved on 12: O3 (no delivery date) gives back 2, O1 keeps its 8.
    expect(await h.kit.reservationsOf(x)).toEqual({ [o1]: '8', [o3]: '4' });
    expect(await h.kit.alerts.shortItemCount(o3)).toBe(1);
    const [notice]: Array<{ count: string }> = await h.db.dataSource.query(
      `SELECT COUNT(*) AS count FROM notifications
        WHERE event_type = 'inventory.order.short' AND dedupe_key = $1 AND status <> 'resolved'`,
      [`order:${o3}`],
    );
    expect(Number(notice.count)).toBe(1);
    expect(await h.orderState(po2.id)).toEqual({
      status: 'partially_received',
      received: ['2'],
    });

    // 2. Only 2 left received on that line.
    await h
      .returnToSupplier(po2.id, [{ poLineId: po2.lineIds[0], quantity: 3 }])
      .expect(409);
    expect(await h.documentsOf(po2.id)).toEqual({ returns: 1, movements: 1 });

    // 3. The supplier sends replacements: the line can be received again.
    await h
      .receive(po2.id, [{ poLineId: po2.lineIds[0], quantity: 3 }])
      .expect(201);
    expect(await h.orderState(po2.id)).toEqual({
      status: 'received',
      received: ['5'],
    });
    await expectLedgerBalanced(h.db, x);

    // Purchasing reads the prices; the storekeeper reads none of them.
    const priced = await h
      .get(`/inventory/supplier-returns/${bodyOf(returned).id}`, h.PURCHASING)
      .expect(200);
    expect(bodyOf(priced).lines[0]).toMatchObject({
      unitCost: 130000,
      value: -390000,
      referenceValue: 390000,
    });
    expectNoMoneyKeys(
      (
        await h
          .get(`/inventory/supplier-returns/${bodyOf(returned).id}`)
          .expect(200)
      ).body,
    );
    expectNoMoneyKeys(
      (
        await h
          .get(`/inventory/supplier-returns?purchaseOrderId=${po2.id}`)
          .expect(200)
      ).body,
    );
  });

  /** Y received 1 @ 100 000 on one PO and 1 @ 200 000 on another, then 1 issued. */
  async function lastUnitOfY() {
    const y = await h.db.createItem();
    const cheap = await h.createPurchaseOrder([
      { itemId: y, quantity: '1', unitPrice: 100000 },
    ]);
    const dear = await h.createPurchaseOrder([
      { itemId: y, quantity: '1', unitPrice: 200000 },
    ]);
    await h
      .receive(cheap.id, [{ poLineId: cheap.lineIds[0], quantity: 1 }])
      .expect(201);
    await h
      .receive(dear.id, [{ poLineId: dear.lineIds[0], quantity: 1 }])
      .expect(201);
    expect(await stockOf(y)).toEqual({ onHand: '2', value: '300000' });
    await issueFreeStock(y, '1');
    expect(await stockOf(y)).toEqual({ onHand: '1', value: '150000' });
    return { y, cheap, dear };
  }

  it('takes the whole remaining value with the last unit, PO cost below it (step 4)', async () => {
    const { y, cheap } = await lastUnitOfY();

    await h
      .returnToSupplier(cheap.id, [{ poLineId: cheap.lineIds[0], quantity: 1 }])
      .expect(201);
    expect(await lastMovement(y)).toMatchObject({
      value: '-150000',
      reference: '100000',
    });
    expect(await stockOf(y)).toEqual({ onHand: '0', value: '0' });
    await expectLedgerBalanced(h.db, y);

    // The ledger stores the reference value: it would reveal the PO price.
    const ledger = await h.get(`/inventory/stock/${y}/movements`).expect(200);
    expectNoMoneyKeys(ledger.body);
    const pricedLedger = await h
      .get(`/inventory/stock/${y}/movements`, h.PURCHASING)
      .expect(200);
    expect(JSON.stringify(pricedLedger.body)).toContain(
      '"referenceValue":100000',
    );
  });

  it('takes the whole remaining value with the last unit, PO cost above it (step 5)', async () => {
    const { y, dear } = await lastUnitOfY();

    await h
      .returnToSupplier(dear.id, [{ poLineId: dear.lineIds[0], quantity: 1 }])
      .expect(201);
    expect(await lastMovement(y)).toMatchObject({
      value: '-150000',
      reference: '200000',
    });
    expect(await stockOf(y)).toEqual({ onHand: '0', value: '0' });
    await expectLedgerBalanced(h.db, y);
  });

  it('never takes the value below 0 on a partial return (step 6)', async () => {
    const w = await h.db.createItem();
    await h.db.post({
      documentType: 'spec_opening',
      documentId: w,
      lines: [
        {
          itemId: w,
          movementType: StockMovementType.RECEIPT,
          quantity: '2',
          unitCost: 50000,
        },
      ],
    });
    const po = await h.createPurchaseOrder(
      [{ itemId: w, quantity: '2', unitPrice: 130000, receivedQty: '2' }],
      'received',
    );

    await h
      .returnToSupplier(po.id, [{ poLineId: po.lineIds[0], quantity: 1 }])
      .expect(201);
    expect(await lastMovement(w)).toMatchObject({
      value: '-100000',
      reference: '130000',
    });
    expect(await stockOf(w)).toEqual({ onHand: '1', value: '0' });
    await issueFreeStock(w, '1');
    expect(await lastMovement(w)).toMatchObject({ value: '0' });
    await expectLedgerBalanced(h.db, w);
  });

  it('keeps a closed order closed and expecting nothing (step 7), and refuses one with nothing received', async () => {
    const z = await h.db.createItem();
    const po3 = await h.createPurchaseOrder([
      { itemId: z, quantity: '6', unitPrice: 1000 },
    ]);
    await h
      .receive(po3.id, [{ poLineId: po3.lineIds[0], quantity: 2 }])
      .expect(201);
    await h.db.dataSource.query(
      `UPDATE purchase_orders SET status = 'closed' WHERE id = $1`,
      [po3.id],
    );

    await h
      .returnToSupplier(po3.id, [{ poLineId: po3.lineIds[0], quantity: 1 }])
      .expect(201);
    expect(await h.orderState(po3.id)).toEqual({
      status: 'closed',
      received: ['1'],
    });
    await h
      .receive(po3.id, [{ poLineId: po3.lineIds[0], quantity: 1 }])
      .expect(409);

    const approved = await h.createPurchaseOrder([
      { itemId: z, quantity: '2', unitPrice: 1000 },
    ]);
    await h
      .returnToSupplier(approved.id, [
        { poLineId: approved.lineIds[0], quantity: 1 },
      ])
      .expect(409);
    await h
      .returnToSupplier(po3.id, [{ poLineId: po3.lineIds[0], quantity: 1 }], {
        reason: '   ',
      })
      .expect(400);
    expect(await h.documentsOf(approved.id)).toEqual({
      returns: 0,
      movements: 0,
    });
  });

  describe('races', () => {
    /**
     * Holds `lockSql` (one row `FOR UPDATE`), starts each contender once the ones before it
     * wait behind the holder, then lets them all go.
     */
    async function queuedBehind<T>(
      lockSql: string,
      params: unknown[],
      contenders: Array<() => Promise<T>>,
    ): Promise<Array<PromiseSettledResult<T>>> {
      const holder = h.db.dataSource.createQueryRunner();
      await holder.connect();
      const started: Array<Promise<T>> = [];
      try {
        await holder.startTransaction();
        await holder.query(lockSql, params);
        const [{ pid }] = (await holder.query(
          `SELECT pg_backend_pid() AS pid`,
        )) as Array<{ pid: number }>;
        for (const contender of contenders) {
          const run = contender();
          run.catch(() => undefined);
          started.push(run);
          await waitForWaiters(pid, started.length);
        }
        await holder.commitTransaction();
      } finally {
        if (holder.isTransactionActive) {
          await holder.rollbackTransaction().catch(() => undefined);
        }
        await holder.release();
      }
      return Promise.allSettled(started);
    }

    /** Backends queued behind the holder, following the chain of waiters on one row. */
    async function waitForWaiters(pid: number, count: number): Promise<void> {
      const deadline = Date.now() + 10_000;
      for (;;) {
        const [{ waiting }]: Array<{ waiting: string }> =
          await h.db.dataSource.query(
            `WITH RECURSIVE queued(pid) AS (
               SELECT $1::int
               UNION
               SELECT a.pid FROM pg_stat_activity a
                 JOIN queued q ON q.pid = ANY(pg_blocking_pids(a.pid))
             )
             SELECT COUNT(*) - 1 AS waiting FROM queued`,
            [pid],
          );
        if (Number(waiting) >= count) return;
        if (Date.now() > deadline) {
          throw new Error(
            `Only ${waiting} of ${count} contenders reached the held lock.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    const ORDER_LOCK = `SELECT id FROM purchase_orders WHERE id = $1 FOR UPDATE`;
    const statusOf = (result: PromiseSettledResult<Response>) =>
      result.status === 'fulfilled' ? result.value.status : 'rejected';

    it('(a) keeps received = Σ receipts − Σ returns under a return racing a receipt', async () => {
      const x = await h.db.createItem();
      const po = await h.createPurchaseOrder([
        { itemId: x, quantity: '10', unitPrice: 1000 },
      ]);
      const [line] = po.lineIds;
      await h.receive(po.id, [{ poLineId: line, quantity: 6 }]).expect(201);

      const results = await queuedBehind<Response>(
        ORDER_LOCK,
        [po.id],
        [
          async () => h.receive(po.id, [{ poLineId: line, quantity: 4 }]),
          async () =>
            h.returnToSupplier(po.id, [{ poLineId: line, quantity: 3 }]),
        ],
      );

      expect(results.map(statusOf)).toEqual([201, 201]);
      expect(await h.orderState(po.id)).toEqual({
        status: 'partially_received',
        received: ['7'],
      });
      expect(await stockOf(x)).toEqual({ onHand: '7', value: '7000' });
    });

    it('(b) never leaves stock below zero or below what is reserved under a return racing an issue', async () => {
      const v = await h.db.createItem();
      const po = await h.createPurchaseOrder([
        { itemId: v, quantity: '5', unitPrice: 1000 },
      ]);
      await h
        .receive(po.id, [{ poLineId: po.lineIds[0], quantity: 5 }])
        .expect(201);
      await h.kit.createOrder({ bom: [{ itemId: v, perPanel: '3' }] });

      const results = await queuedBehind<unknown>(
        `SELECT item_id FROM stock_balances WHERE item_id = $1 FOR UPDATE`,
        [v],
        [
          async () =>
            h.returnToSupplier(po.id, [
              { poLineId: po.lineIds[0], quantity: 3 },
            ]),
          () => issueFreeStock(v, '2'),
        ],
      );

      expect(results[0].status).toBe('fulfilled');
      const balance = await h.kit.balanceOf(v);
      expect(new Decimal(balance.onHand).isNegative()).toBe(false);
      expect(
        new Decimal(balance.reserved).lessThanOrEqualTo(balance.onHand),
      ).toBe(true);
      expect(balance.reserved).toBe(balance.sum);
      await expectLedgerBalanced(h.db, v);
    });

    it('(c) answers a twin carrying one request key with the first return, at the boundary', async () => {
      const x = await h.db.createItem();
      // Exactly 2 received: a twin checked before its header insert would be refused with 409.
      const po = await h.createPurchaseOrder([
        { itemId: x, quantity: '2', unitPrice: 1000 },
      ]);
      await h
        .receive(po.id, [{ poLineId: po.lineIds[0], quantity: 2 }])
        .expect(201);
      const requestKey = randomUUID();
      const body = [{ poLineId: po.lineIds[0], quantity: 2 }];

      const results = await queuedBehind<Response>(
        ORDER_LOCK,
        [po.id],
        [
          async () => h.returnToSupplier(po.id, body, { requestKey }),
          async () => h.returnToSupplier(po.id, body, { requestKey }),
        ],
      );

      expect(results.map(statusOf).sort()).toEqual([200, 201]);
      const ids = results.map((result) =>
        result.status === 'fulfilled' ? bodyOf(result.value).id : null,
      );
      expect(ids[0]).toBe(ids[1]);
      expect(await h.documentsOf(po.id)).toEqual({ returns: 1, movements: 1 });
      expect(await h.orderState(po.id)).toEqual({
        status: 'approved',
        received: ['0'],
      });
    });
  });
});
