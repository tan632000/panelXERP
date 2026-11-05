import { DataSource, type QueryRunner } from 'typeorm';

import { AddEstimatePricing1793890216777 } from '@plugins/sales/estimate/database/migrations/1793890216777-add-estimate-pricing';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

interface PricingRow {
  revision: number;
  priced_at: Date | null;
  priced_by: number | null;
  submitted_at: Date | null;
  submitted_by: number | null;
}

/**
 * The migration runs against a copy of the revisions table in a schema of its own, inside a
 * transaction that is always rolled back. Only that schema is on the search path (`SET LOCAL`),
 * and the migration names its tables unqualified, so it can never reach the real table and no
 * other spec sees the DDL.
 */
describeWithDatabase('AddEstimatePricing (real Postgres)', () => {
  const migration = new AddEstimatePricing1793890216777();
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
      const schema = `scratch_estimate_pricing_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      await runner.query(`CREATE SCHEMA ${schema}`);
      await runner.query(`SET LOCAL search_path TO ${schema}`);
      await runner.query(`CREATE TABLE users (id SERIAL PRIMARY KEY)`);
      await runner.query(`
        CREATE TABLE sales_estimate_revisions (
          id SERIAL PRIMARY KEY,
          estimate_id INT NOT NULL,
          revision INT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'draft',
          submitted_at TIMESTAMPTZ,
          submitted_by INT REFERENCES users(id)
        )
      `);
      await run(runner);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  }

  const rowsOf = (runner: QueryRunner): Promise<PricingRow[]> =>
    runner.query(
      `SELECT revision, priced_at, priced_by, submitted_at, submitted_by
         FROM sales_estimate_revisions ORDER BY estimate_id, revision`,
    );

  const columnsOf = async (runner: QueryRunner): Promise<string[]> =>
    (
      (await runner.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'sales_estimate_revisions'
            AND column_name IN ('priced_at', 'priced_by') ORDER BY column_name`,
      )) as Array<{ column_name: string }>
    ).map((row) => row.column_name);

  it('counts every submitted and superseded revision as priced by its submitter, leaves drafts unpriced, and drops both columns on down', async () => {
    await inScratchSchema(async (runner) => {
      await runner.query(`INSERT INTO users DEFAULT VALUES`);
      await runner.query(`INSERT INTO users DEFAULT VALUES`);
      await runner.query(`
        INSERT INTO sales_estimate_revisions (estimate_id, revision, status, submitted_at, submitted_by)
        VALUES
          (1, 1, 'superseded', '2026-10-01T08:00:00Z', 1),
          (1, 2, 'submitted',  '2026-10-02T09:30:00Z', 2),
          (1, 3, 'draft',      NULL,                   NULL),
          (2, 1, 'draft',      NULL,                   NULL)
      `);

      await migration.up(runner);

      const rows = await rowsOf(runner);
      expect(
        rows.map((row) => [
          row.revision,
          row.priced_at?.toISOString() ?? null,
          row.priced_by,
        ]),
      ).toEqual([
        [1, '2026-10-01T08:00:00.000Z', 1],
        [2, '2026-10-02T09:30:00.000Z', 2],
        [3, null, null],
        [1, null, null],
      ]);
      expect(await columnsOf(runner)).toEqual(['priced_at', 'priced_by']);

      await migration.down(runner);

      expect(await columnsOf(runner)).toEqual([]);
    });
  });
});
