import { DataSource, type QueryRunner } from 'typeorm';

import { AddEstimateAiFields1795364024211 } from '@plugins/sales/estimate/database/migrations/1795364024211-add-estimate-ai-fields';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

/**
 * The migration runs against stand-ins of the tables it touches, in a schema of its own, inside a
 * transaction that is always rolled back. Only that schema is on the search path (`SET LOCAL`),
 * and the migration names its tables unqualified, so it can never reach the real tables and no
 * other spec sees the DDL.
 */
describeWithDatabase('AddEstimateAiFields (real Postgres)', () => {
  const migration = new AddEstimateAiFields1795364024211();
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [],
    });
    try {
      await dataSource.initialize();
    } catch (error: unknown) {
      throw new Error(
        `Postgres is unreachable (${error instanceof Error ? error.message : String(error)}). Run inside the compose backend container, or set SKIP_DB_SPECS=1 to skip these checks.`,
      );
    }
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  async function inScratchSchema(
    run: (runner: QueryRunner) => Promise<void>,
  ): Promise<void> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const schema = `scratch_estimate_ai_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      await runner.query(`CREATE SCHEMA ${schema}`);
      await runner.query(`SET LOCAL search_path TO ${schema}`);
      for (const table of [
        'users',
        'sales_requests',
        'sales_estimates',
        'sales_estimate_panels',
        'sales_estimate_bom_lines',
      ]) {
        await runner.query(`CREATE TABLE ${table} (id SERIAL PRIMARY KEY)`);
      }
      await run(runner);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  }

  const columnsOf = async (
    runner: QueryRunner,
    table: string,
  ): Promise<string[]> =>
    (
      (await runner.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = $1
            AND column_name IN ('is_ai_generated', 'ai_confidence', 'ai_note', 'is_verified')
          ORDER BY column_name`,
        [table],
      )) as Array<{ column_name: string }>
    ).map((row) => row.column_name);

  const tableExists = async (
    runner: QueryRunner,
    table: string,
  ): Promise<boolean> =>
    (
      (await runner.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = $1`,
        [table],
      )) as unknown[]
    ).length > 0;

  it('adds the AI columns and the run table, defaults the flags to false, and removes them all on down', async () => {
    await inScratchSchema(async (runner) => {
      await runner.query(`INSERT INTO sales_estimate_panels DEFAULT VALUES`);
      await runner.query(`INSERT INTO sales_estimate_bom_lines DEFAULT VALUES`);

      await migration.up(runner);

      expect(await columnsOf(runner, 'sales_estimate_panels')).toEqual([
        'ai_note',
        'is_ai_generated',
      ]);
      expect(await columnsOf(runner, 'sales_estimate_bom_lines')).toEqual([
        'ai_confidence',
        'ai_note',
        'is_ai_generated',
        'is_verified',
      ]);
      expect(await tableExists(runner, 'sales_estimate_ai_runs')).toBe(true);
      const [line] = (await runner.query(
        `SELECT is_ai_generated, is_verified, ai_confidence FROM sales_estimate_bom_lines`,
      )) as Array<{
        is_ai_generated: boolean;
        is_verified: boolean;
        ai_confidence: string | null;
      }>;
      expect(line).toEqual({
        is_ai_generated: false,
        is_verified: false,
        ai_confidence: null,
      });

      await migration.down(runner);

      expect(await columnsOf(runner, 'sales_estimate_panels')).toEqual([]);
      expect(await columnsOf(runner, 'sales_estimate_bom_lines')).toEqual([]);
      expect(await tableExists(runner, 'sales_estimate_ai_runs')).toBe(false);
    });
  });

  it('allows one queued or running run per request, and a new run once it has ended', async () => {
    await inScratchSchema(async (runner) => {
      await runner.query(`INSERT INTO users DEFAULT VALUES`);
      await runner.query(`INSERT INTO sales_requests DEFAULT VALUES`);
      await migration.up(runner);
      const insert = (status: string) =>
        runner.query(
          `INSERT INTO sales_estimate_ai_runs (request_id, status, created_by)
           VALUES (1, $1, 1)`,
          [status],
        );

      const indexes = (await runner.query(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = current_schema() AND indexname = 'uq_sales_estimate_ai_runs_active'`,
      )) as unknown[];
      expect(indexes).toHaveLength(1);

      await insert('queued');
      await runner.query('SAVEPOINT duplicate');
      await expect(insert('running')).rejects.toMatchObject({ code: '23505' });
      await runner.query('ROLLBACK TO SAVEPOINT duplicate');

      await runner.query(
        `UPDATE sales_estimate_ai_runs SET status = 'failed' WHERE request_id = 1`,
      );
      await insert('queued');
      await insert('failed');
    });
  });

  it('rejects an AI confidence outside 0..1', async () => {
    await inScratchSchema(async (runner) => {
      await runner.query(`INSERT INTO sales_estimate_bom_lines DEFAULT VALUES`);
      await migration.up(runner);

      await expect(
        runner.query(`UPDATE sales_estimate_bom_lines SET ai_confidence = 1.5`),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });
});
