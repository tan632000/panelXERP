import type { DataSource } from 'typeorm';

/**
 * Deterministic overlap for race specs: a transaction holds one row `FOR UPDATE` while every
 * contender is started and has reached the lock, so the contenders really overlap and run in the
 * order they queued. A bare `Promise.all` loop proves nothing about order or overlap. Named
 * `*.helper-spec.ts` so the production build leaves it out and jest does not run it as a test.
 */

/**
 * Holds `lockSql` (one row `FOR UPDATE`), starts each contender once the ones before it wait
 * behind the holder, runs `between` after each start, then lets them all go.
 */
export async function queuedBehind<T>(
  dataSource: DataSource,
  lockSql: string,
  params: unknown[],
  contenders: Array<() => Promise<T>>,
  between: (started: number) => Promise<void> = () => Promise.resolve(),
): Promise<Array<PromiseSettledResult<T>>> {
  const holder = dataSource.createQueryRunner();
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
      await waitForWaiters(dataSource, pid, started.length);
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
export async function waitForWaiters(
  dataSource: DataSource,
  pid: number,
  count: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const [{ waiting }]: Array<{ waiting: string }> = await dataSource.query(
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
