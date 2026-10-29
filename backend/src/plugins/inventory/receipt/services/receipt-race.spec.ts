import { randomUUID } from 'crypto';

import { Notification } from '@kernel/core/audit/notification.entity';
import { NotificationService } from '@kernel/core/audit/notification.service';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';

import { describeWithDatabase } from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { PurchaseOrderApprovalService } from '@plugins/inventory/purchase-order/services/purchase-order-approval.service';
import { PurchaseOrderService } from '@plugins/inventory/purchase-order/services/purchase-order.service';
import {
  openReceiptHarness,
  type ReceiptHarness,
} from '@plugins/inventory/receipt/receipt-db.helper-spec';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Response } from 'supertest';

/**
 * Receipts racing each other and a short-close on the real Postgres of the compose stack. Each
 * race holds the purchase order's header lock in a transaction of its own until every contender
 * is queued behind it, so the contenders really overlap (each one is past everything it does
 * before the lock) and the order they queued in is the order they run in.
 */
describeWithDatabase('StockReceiptService races (real Postgres)', () => {
  // Each race queues real transactions behind a held lock.
  jest.setTimeout(30_000);

  let h: ReceiptHarness;
  let approval: PurchaseOrderApprovalService;
  let purchasing: AuthUserPayload;

  beforeAll(async () => {
    h = await openReceiptHarness();
    const notifications = new NotificationService(
      h.db.dataSource.getRepository(Notification),
      null as never,
      null as never,
    );
    approval = new PurchaseOrderApprovalService(
      h.db.dataSource,
      new PurchaseOrderService(h.db.dataSource),
      notifications,
    );
    purchasing = {
      userId: await h.db.userId('purchasing'),
      role: 'purchasing',
      permissions: seededRolePermissions('purchasing') ?? [],
    };
  });

  afterAll(async () => {
    await h?.close();
  });

  /**
   * Holds the order's header lock, starts each contender only once the ones before it wait
   * behind the holder, then lets them all go.
   */
  async function queuedBehindOrderLock<T>(
    purchaseOrderId: number,
    contenders: Array<() => Promise<T>>,
  ): Promise<Array<PromiseSettledResult<T>>> {
    const holder = h.db.dataSource.createQueryRunner();
    await holder.connect();
    const started: Array<Promise<T>> = [];
    try {
      await holder.startTransaction();
      await holder.query(
        `SELECT id FROM purchase_orders WHERE id = $1 FOR UPDATE`,
        [purchaseOrderId],
      );
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

  /**
   * Only backends queued behind the holder count, never another spec's waiting query. A second
   * waiter on one row queues behind the first waiter, not the holder, so the chain is followed.
   */
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
          `Only ${waiting} of ${count} contenders reached the order lock.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  const statusOf = (result: PromiseSettledResult<Response>) =>
    result.status === 'fulfilled' ? result.value.status : 'rejected';

  it('(a) lets one of two receipts of X 6 through on 10 remaining', async () => {
    const x = await h.db.createItem();
    const po = await h.createPurchaseOrder([
      { itemId: x, quantity: '10', unitPrice: 1000 },
    ]);
    const body = [{ poLineId: po.lineIds[0], quantity: 6 }];

    const results = await queuedBehindOrderLock<Response>(po.id, [
      async () => h.receive(po.id, body),
      async () => h.receive(po.id, body),
    ]);

    expect(results.map(statusOf).sort()).toEqual([201, 409]);
    expect(await h.orderState(po.id)).toEqual({
      status: 'partially_received',
      received: ['6'],
    });
    expect(await h.documentsOf(po.id)).toEqual({ receipts: 1, movements: 1 });
  });

  it('(b) never receives on an order a short-close got to first', async () => {
    const x = await h.db.createItem();
    const closedFirst = await h.createPurchaseOrder([
      { itemId: x, quantity: '10', unitPrice: 1000 },
    ]);
    const receivedFirst = await h.createPurchaseOrder([
      { itemId: x, quantity: '10', unitPrice: 1000 },
    ]);
    const close = (id: number) => () =>
      approval.close(id, { reason: 'Supplier stopped the line' }, purchasing);
    const receive = (po: { id: number; lineIds: number[] }) => async () =>
      h.receive(po.id, [{ poLineId: po.lineIds[0], quantity: 6 }]);

    const [closing, late] = await queuedBehindOrderLock<unknown>(
      closedFirst.id,
      [close(closedFirst.id), receive(closedFirst)],
    );
    expect(closing.status).toBe('fulfilled');
    expect(statusOf(late as PromiseSettledResult<Response>)).toBe(409);
    expect(await h.orderState(closedFirst.id)).toEqual({
      status: 'closed',
      received: ['0'],
    });
    expect(await h.documentsOf(closedFirst.id)).toEqual({
      receipts: 0,
      movements: 0,
    });

    // The other way round the receipt usually stands and the close ends a partly received
    // order. A receipt number taken meanwhile by another suite's receipt makes the receipt
    // retry after letting the lock go, and then the close wins: either way, what the order
    // received is exactly what its receipts hold.
    const [early, closingAfter] = await queuedBehindOrderLock<unknown>(
      receivedFirst.id,
      [receive(receivedFirst), close(receivedFirst.id)],
    );
    expect(closingAfter.status).toBe('fulfilled');
    const received = statusOf(early as PromiseSettledResult<Response>) === 201;
    expect(await h.orderState(receivedFirst.id)).toEqual({
      status: 'closed',
      received: [received ? '6' : '0'],
    });
    expect(await h.documentsOf(receivedFirst.id)).toEqual({
      receipts: received ? 1 : 0,
      movements: received ? 1 : 0,
    });
  });

  it('(c) answers a twin carrying the same request key with the first receipt, even at the boundary', async () => {
    const x = await h.db.createItem();
    // Exactly 6 remain: a twin checked before its header insert would be refused with 409.
    const po = await h.createPurchaseOrder([
      { itemId: x, quantity: '6', unitPrice: 1000 },
    ]);
    const requestKey = randomUUID();
    const body = [{ poLineId: po.lineIds[0], quantity: 6 }];

    const results = await queuedBehindOrderLock<Response>(po.id, [
      async () => h.receive(po.id, body, { requestKey }),
      async () => h.receive(po.id, body, { requestKey }),
    ]);

    expect(results.map(statusOf).sort()).toEqual([200, 201]);
    const ids = results.map((result) =>
      result.status === 'fulfilled'
        ? (result.value.body as { id: number }).id
        : null,
    );
    expect(ids[0]).toBe(ids[1]);
    expect(await h.documentsOf(po.id)).toEqual({ receipts: 1, movements: 1 });
    expect(await h.orderState(po.id)).toEqual({
      status: 'received',
      received: ['6'],
    });
  });
});
