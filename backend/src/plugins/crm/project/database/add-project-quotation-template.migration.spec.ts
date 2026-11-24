import { DataSource, type QueryRunner } from 'typeorm';

import { AddProjectQuotationTemplate1795408104542 } from '@plugins/crm/project/database/migrations/1795408104542-add-project-quotation-template';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

describeWithDatabase('AddProjectQuotationTemplate (real Postgres)', () => {
  const migration = new AddProjectQuotationTemplate1795408104542();
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
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  /** Runs in a throwaway schema holding a stand-in `projects` table; always rolled back. */
  async function inScratchSchema(
    run: (runner: QueryRunner) => Promise<void>,
  ): Promise<void> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const schema = `scratch_project_template_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      await runner.query(`CREATE SCHEMA ${schema}`);
      await runner.query(`SET LOCAL search_path TO ${schema}`);
      await runner.query(
        `CREATE TABLE projects (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL)`,
      );
      await runner.query(`INSERT INTO projects (name) VALUES ('Old project')`);
      await run(runner);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  }

  const columns = async (runner: QueryRunner): Promise<string[]> =>
    (
      (await runner.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'projects'`,
      )) as Array<{ column_name: string }>
    ).map((row) => row.column_name);

  it('adds a nullable indexed column with no foreign key, leaves old rows null, and drops cleanly', async () => {
    await inScratchSchema(async (runner) => {
      await migration.up(runner);
      expect(await columns(runner)).toContain('quotation_template_id');

      const rows = (await runner.query(
        `SELECT quotation_template_id FROM projects`,
      )) as Array<{ quotation_template_id: number | null }>;
      expect(rows).toEqual([{ quotation_template_id: null }]);

      const foreignKeys = (await runner.query(
        `SELECT 1 FROM information_schema.table_constraints
          WHERE table_schema = current_schema() AND table_name = 'projects'
            AND constraint_type = 'FOREIGN KEY'`,
      )) as unknown[];
      expect(foreignKeys).toHaveLength(0);

      const indexes = (await runner.query(
        `SELECT 1 FROM pg_indexes
          WHERE schemaname = current_schema()
            AND indexname = 'ix_projects_quotation_template_id'`,
      )) as unknown[];
      expect(indexes).toHaveLength(1);

      await migration.down(runner);
      expect(await columns(runner)).not.toContain('quotation_template_id');
      const left = (await runner.query(
        `SELECT 1 FROM pg_indexes
          WHERE schemaname = current_schema()
            AND indexname = 'ix_projects_quotation_template_id'`,
      )) as unknown[];
      expect(left).toHaveLength(0);
    });
  });
});
