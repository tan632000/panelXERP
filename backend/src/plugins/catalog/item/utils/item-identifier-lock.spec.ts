import { DataSource, type QueryRunner } from 'typeorm';

import { lockItemIdentifiers } from '@plugins/catalog/item/utils/item-identifier.util';

/**
 * The identifier lock against the real Postgres of the compose stack: two transactions
 * writing the same code or barcode, in any case, queue behind each other, while different
 * values do not. An unreachable database fails the suite; `SKIP_DB_SPECS=1` is the one
 * explicit opt-out.
 */
const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

describeWithDatabase('Item identifier lock against Postgres', () => {
  let dataSource: DataSource;
  const runners: QueryRunner[] = [];

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    try {
      await dataSource.initialize();
    } catch (error: unknown) {
      throw new Error(
        `Postgres is unreachable (${error instanceof Error ? error.message : String(error)}). Run inside the compose backend container, or set SKIP_DB_SPECS=1 to skip these checks.`,
      );
    }
  });

  afterEach(async () => {
    for (const runner of runners.splice(0)) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  async function openTransaction(): Promise<{
    runner: QueryRunner;
    pid: number;
  }> {
    const runner = dataSource.createQueryRunner();
    runners.push(runner);
    await runner.connect();
    await runner.startTransaction();
    const [{ pid }] = (await runner.query(
      'SELECT pg_backend_pid() AS pid',
    )) as Array<{ pid: number }>;
    return { runner, pid };
  }

  async function blockedBy(pid: number): Promise<number[]> {
    const rows: Array<{ pid: number }> = await dataSource.query(
      'SELECT unnest(pg_blocking_pids($1)) AS pid',
      [pid],
    );
    return rows.map((row) => row.pid);
  }

  async function waitUntilBlocked(pid: number): Promise<number[]> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const blockers = await blockedBy(pid);
      if (blockers.length > 0) return blockers;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return [];
  }

  it('makes a second writer of the same value, in another case, wait until the first commits', async () => {
    const first = await openTransaction();
    const second = await openTransaction();
    await lockItemIdentifiers(first.runner.manager, ['Race-Value-1']);

    let secondHasLock = false;
    const waiting = lockItemIdentifiers(second.runner.manager, [
      'race-value-1',
    ]).then(() => {
      secondHasLock = true;
    });

    expect(await waitUntilBlocked(second.pid)).toContain(first.pid);
    expect(secondHasLock).toBe(false);

    await first.runner.commitTransaction();
    await waiting;
    expect(secondHasLock).toBe(true);
  });

  it('does not make a writer of a different value wait', async () => {
    const first = await openTransaction();
    const second = await openTransaction();
    await lockItemIdentifiers(first.runner.manager, ['race-value-2']);

    await lockItemIdentifiers(second.runner.manager, ['race-value-3']);

    expect(await blockedBy(second.pid)).toEqual([]);
  });
});
