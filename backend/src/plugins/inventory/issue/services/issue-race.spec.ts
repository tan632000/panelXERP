import { randomUUID } from 'crypto';

import { describeWithDatabase } from '@plugins/inventory/_shared/inventory-db.helper-spec';
import {
  STOCK_ISSUE_CODE_PREFIX,
  STOCK_ISSUE_TABLE,
  WORKSHOP_RETURN_CODE_PREFIX,
  WORKSHOP_RETURN_TABLE,
} from '@plugins/inventory/issue/constants/issue.constant';
import {
  openIssueHarness,
  type IssueHarness,
} from '@plugins/inventory/issue/issue-db.helper-spec';
import { yearlyDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';

import type { Response } from 'supertest';

/**
 * Issues and workshop returns racing each other and an order cancel on the real Postgres of
 * the compose stack. Each race holds a row lock in a transaction of its own until every
 * contender is queued behind it, so the contenders really overlap (each is past everything it
 * does before that lock) and run in the order they queued.
 */
describeWithDatabase('StockIssueService races (real Postgres)', () => {
  // Each race queues real transactions behind a held lock.
  jest.setTimeout(30_000);

  let h: IssueHarness;
  const dummies: Array<{ table: string; id: number }> = [];

  beforeAll(async () => {
    h = await openIssueHarness();
  });

  afterAll(async () => {
    for (const dummy of dummies) {
      await h?.db.dataSource.query(`DELETE FROM ${dummy.table} WHERE id = $1`, [
        dummy.id,
      ]);
    }
    await h?.close();
  });

  /**
   * Holds `lockSql` (one row `FOR UPDATE`), starts each contender once the ones before it wait
   * behind the holder, runs `between` after each start, then lets them all go.
   */
  async function queuedBehind<T>(
    lockSql: string,
    params: unknown[],
    contenders: Array<() => Promise<T>>,
    between: (started: number) => Promise<void> = () => Promise.resolve(),
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
        await between(started.length);
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
   * waiter on one row queues behind the first waiter, so the chain is followed.
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
          `Only ${waiting} of ${count} contenders reached the held lock.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  /**
   * Once the first contender holds its document number (uncommitted), commits a number above
   * it, so the second contender reads a different one. Two contenders reading the same number
   * collide on the code index: the second's whole transaction reruns after the first commits,
   * which would hide a check made outside the lock.
   */
  const distinctNumbers =
    (table: string, prefix: string) => async (started: number) => {
      if (started !== 1) return;
      const next = await yearlyDocumentCode({
        manager: h.db.dataSource.manager,
        table,
        prefix,
        now: new Date(),
      });
      const following = next.replace(/\d+$/, (digits) =>
        String(Number(digits) + 1).padStart(digits.length, '0'),
      );
      const [dummy]: Array<{ id: number }> = await h.db.dataSource.query(
        `INSERT INTO ${table} (code, order_id) VALUES ($1, 0) RETURNING id`,
        [following],
      );
      dummies.push({ table, id: dummy.id });
    };

  const BALANCE_LOCK = `SELECT item_id FROM stock_balances WHERE item_id = $1 FOR UPDATE`;
  const statusOf = (result: PromiseSettledResult<Response>) =>
    result.status === 'fulfilled' ? result.value.status : 'rejected';
  const idOf = (result: PromiseSettledResult<Response>) =>
    result.status === 'fulfilled'
      ? (result.value.body as { id: number }).id
      : null;

  /** An order needing `demand` of X that has been issued `issued` of it, from enough stock. */
  async function issuedOrder(stock: string, demand: string, issued: number) {
    const x = await h.db.createItem();
    await h.stockOf(x, stock, 1000);
    const order = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: demand }] })
    ).orderId;
    if (issued > 0) {
      await h.issue(order, [{ itemId: x, quantity: issued }]).expect(201);
    }
    return { x, order };
  }

  it('(a) lets two orders draw their own reservations at once, never below zero available', async () => {
    const x = await h.db.createItem();
    await h.stockOf(x, '6', 1000);
    const o1 = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '3' }] })
    ).orderId;
    const o2 = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '3' }] })
    ).orderId;

    const results = await queuedBehind<Response>(
      BALANCE_LOCK,
      [x],
      [
        async () => h.issue(o1, [{ itemId: x, quantity: 3 }]),
        async () => h.issue(o2, [{ itemId: x, quantity: 3 }]),
      ],
      distinctNumbers(STOCK_ISSUE_TABLE, STOCK_ISSUE_CODE_PREFIX),
    );

    expect(results.map(statusOf)).toEqual([201, 201]);
    expect(await h.kit.balanceOf(x)).toEqual({
      onHand: '0',
      reserved: '0',
      sum: '0',
    });
  });

  it('(b) never issues to an order whose cancel got to it first', async () => {
    const { x, order } = await issuedOrder('5', '4', 0);

    // The cancel holds the order row and waits for the balance; the issue waits for the order.
    const [cancelled, issued] = await queuedBehind<unknown>(
      BALANCE_LOCK,
      [x],
      [
        () => h.kit.cancel(order),
        async () => h.issue(order, [{ itemId: x, quantity: 1 }]),
      ],
    );

    expect(cancelled.status).toBe('fulfilled');
    expect(statusOf(issued as PromiseSettledResult<Response>)).toBe(409);
    expect(await h.movementCount(order, x)).toBe(0);
  });

  it('(c) lets one of two workshop returns of 3 through on 5 out', async () => {
    const { x, order } = await issuedOrder('5', '5', 5);

    const results = await queuedBehind<Response>(
      BALANCE_LOCK,
      [x],
      [
        async () => h.workshopReturn(order, [{ itemId: x, quantity: 3 }]),
        async () => h.workshopReturn(order, [{ itemId: x, quantity: 3 }]),
      ],
      distinctNumbers(WORKSHOP_RETURN_TABLE, WORKSHOP_RETURN_CODE_PREFIX),
    );

    expect(results.map(statusOf)).toEqual([201, 409]);
    expect(await h.netIssued(order, x)).toBe('2');
  });

  it('(d) asks the second of two issues within the BOM for a reason once the first used it up', async () => {
    const { x, order } = await issuedOrder('8', '6', 4);

    const results = await queuedBehind<Response>(
      BALANCE_LOCK,
      [x],
      [
        async () => h.issue(order, [{ itemId: x, quantity: 2 }]),
        async () => h.issue(order, [{ itemId: x, quantity: 2 }]),
      ],
      distinctNumbers(STOCK_ISSUE_TABLE, STOCK_ISSUE_CODE_PREFIX),
    );

    expect(results.map(statusOf)).toEqual([201, 400]);
    const refused = results[1] as PromiseFulfilledResult<Response>;
    expect(
      String((refused.value.body as { message: unknown }).message),
    ).toContain('needs a reason');
    expect(await h.netIssued(order, x)).toBe('6');
  });

  it('(e) answers twins carrying one request key with the first document, at the boundary', async () => {
    // Net issued 4 of a demand of 6, 2 reserved: a twin checked before its header insert would
    // count 8 > 6 and be refused for a missing reason.
    const { x, order } = await issuedOrder('6', '6', 4);
    const issueKey = randomUUID();
    const twins = await queuedBehind<Response>(
      BALANCE_LOCK,
      [x],
      [
        async () =>
          h.issue(order, [{ itemId: x, quantity: 2 }], {
            requestKey: issueKey,
          }),
        async () =>
          h.issue(order, [{ itemId: x, quantity: 2 }], {
            requestKey: issueKey,
          }),
      ],
    );

    expect(twins.map(statusOf).sort()).toEqual([200, 201]);
    expect(idOf(twins[0])).toBe(idOf(twins[1]));
    expect(await h.netIssued(order, x)).toBe('6');
    expect(await h.movementCount(order, x)).toBe(2);

    // Returning everything that is out, twice with one key: one return.
    const returnKey = randomUUID();
    const returns = await queuedBehind<Response>(
      BALANCE_LOCK,
      [x],
      [
        async () =>
          h.workshopReturn(order, [{ itemId: x, quantity: 6 }], {
            requestKey: returnKey,
          }),
        async () =>
          h.workshopReturn(order, [{ itemId: x, quantity: 6 }], {
            requestKey: returnKey,
          }),
      ],
    );

    expect(returns.map(statusOf).sort()).toEqual([200, 201]);
    expect(idOf(returns[0])).toBe(idOf(returns[1]));
    expect(await h.netIssued(order, x)).toBe('0');
    expect(await h.movementCount(order, x)).toBe(3);
  });
});
