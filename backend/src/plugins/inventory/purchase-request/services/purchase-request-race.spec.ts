import { describeWithDatabase } from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { PURCHASE_REQUEST_ORDER_LOCK } from '@plugins/inventory/purchase-request/constants/purchase-request.constant';
import {
  openPurchaseRequestHarness,
  type PurchaseRequestHarness,
} from '@plugins/inventory/purchase-request/purchase-request-db.helper-spec';

import type { Response } from 'supertest';

/**
 * Purchase requests racing each other and a conversion on the real Postgres of the compose
 * stack.
 */
describeWithDatabase('PurchaseRequest races (real Postgres)', () => {
  jest.setTimeout(30_000);

  let h: PurchaseRequestHarness;

  beforeAll(async () => {
    h = await openPurchaseRequestHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  /** Backends queued behind `pid`, following the chain of waiters. */
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
          `Only ${waiting} of ${count} requests waited on the order's lock: it is not taken.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  const statusOf = (result: PromiseSettledResult<Response>) =>
    result.status === 'fulfilled' ? result.value.status : 'rejected';
  const ids = (res: Response) =>
    res.body as { id: number; lines: Array<{ id: number }> };

  it('(a) raises one request from two concurrent calls for the same order', async () => {
    const x = await h.db.createItem();
    const order = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '10' }] })
    ).orderId;

    // Both calls queue behind the order's lock, so they truly overlap.
    const holder = h.db.dataSource.createQueryRunner();
    await holder.connect();
    const started: Array<Promise<Response>> = [];
    try {
      await holder.query(`SELECT pg_advisory_lock($1, $2)`, [
        PURCHASE_REQUEST_ORDER_LOCK,
        order,
      ]);
      const [{ pid }] = (await holder.query(
        `SELECT pg_backend_pid() AS pid`,
      )) as Array<{
        pid: number;
      }>;
      for (let index = 0; index < 2; index += 1) {
        const run = h
          .post(
            h.PURCHASING,
            `/inventory/purchase-requests/from-order/${order}`,
          )
          .then((res) => res);
        run.catch(() => undefined);
        started.push(run);
        await waitForWaiters(pid, started.length);
      }
    } finally {
      await holder.query(`SELECT pg_advisory_unlock($1, $2)`, [
        PURCHASE_REQUEST_ORDER_LOCK,
        order,
      ]);
      await holder.release();
    }
    const results = await Promise.allSettled(started);

    expect(results.map(statusOf).sort()).toEqual([201, 409]);
    const [{ count }]: Array<{ count: string }> = await h.db.dataSource.query(
      `SELECT COUNT(DISTINCT request_id) AS count FROM purchase_request_lines
        WHERE source_order_id = $1`,
      [order],
    );
    expect(Number(count)).toBe(1);
  });

  it('(b) never leaves a cancelled request with purchase order lines', async () => {
    const x = await h.db.createItem();
    const raised = ids(
      await h
        .post(h.PURCHASING, '/inventory/purchase-requests', {
          lines: [{ itemId: x, quantity: 5 }],
        })
        .expect(201),
    );
    h.track(raised.id);

    const results = await Promise.all([
      h.post(h.PURCHASING, `/inventory/purchase-requests/${raised.id}/cancel`, {
        reason: 'Huỷ thử',
      }),
      h.post(h.PURCHASING, '/inventory/purchase-orders/from-requests', {
        supplierId: h.supplierId,
        lines: [{ prLineId: raised.lines[0].id, quantity: 5 }],
      }),
    ]);

    // The cancel won (200 + 409) or the conversion won (201 + 409), never both.
    expect([
      [200, 409],
      [201, 409],
    ]).toContainEqual(results.map((res) => res.status).sort());
    const [state]: Array<{ is_cancelled: boolean; po_lines: string }> =
      await h.db.dataSource.query(
        `SELECT r.is_cancelled,
                (SELECT COUNT(*) FROM purchase_order_lines pl
                   JOIN purchase_request_lines l ON l.id = pl.pr_line_id
                  WHERE l.request_id = r.id) AS po_lines
           FROM purchase_requests r WHERE r.id = $1`,
        [raised.id],
      );
    expect(state.is_cancelled && Number(state.po_lines) > 0).toBe(false);
    // Exactly one of them won.
    expect(state.is_cancelled !== Number(state.po_lines) > 0).toBe(true);
  });

  it('(c) lets one of two conversions of 6 through on 10 remaining', async () => {
    const x = await h.db.createItem();
    const raised = ids(
      await h
        .post(h.PURCHASING, '/inventory/purchase-requests', {
          lines: [{ itemId: x, quantity: 10 }],
        })
        .expect(201),
    );
    h.track(raised.id);
    const convert = () =>
      h.post(h.PURCHASING, '/inventory/purchase-orders/from-requests', {
        supplierId: h.supplierId,
        lines: [{ prLineId: raised.lines[0].id, quantity: 6 }],
      });

    const results = await Promise.allSettled([
      convert().then((r) => r),
      convert().then((r) => r),
    ]);

    expect(results.map(statusOf).sort()).toEqual([201, 409]);
  });
});
