import { DataSource, type QueryRunner } from 'typeorm';

import { InitQuotationTemplate1795366145811 } from '@plugins/sales/template/database/migrations/1795366145811-init-quotation-template';

/** Opens a connection like the other database specs; they all need the compose Postgres. */
export async function connectScratchDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
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
  return dataSource;
}

/**
 * Runs `run` in a schema of its own holding stand-ins of `users` and `items` (the columns and the
 * unique index the templates and their seed rely on) and the template tables, inside a transaction that is always rolled back. Only that schema is on the search
 * path (`SET LOCAL`), and every statement names its tables unqualified, so nothing can reach
 * the real tables and no other spec sees the DDL.
 */
export async function inScratchSchema(
  dataSource: DataSource,
  run: (runner: QueryRunner) => Promise<void>,
  options: { migrate?: boolean } = {},
): Promise<void> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const schema = `scratch_quotation_template_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    await runner.query(`CREATE SCHEMA ${schema}`);
    await runner.query(`SET LOCAL search_path TO ${schema}`);
    await runner.query(`CREATE TABLE users (id SERIAL PRIMARY KEY)`);
    await runner.query(`
      CREATE TABLE items (
        id SERIAL PRIMARY KEY,
        code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        brand VARCHAR(255),
        item_group VARCHAR(20) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        reference_price NUMERIC(18,2),
        is_deleted BOOLEAN NOT NULL DEFAULT false
      )
    `);
    await runner.query(
      `CREATE UNIQUE INDEX uq_items_code_active ON items (LOWER(code)) WHERE is_deleted = false`,
    );
    if (options.migrate !== false) {
      await new InitQuotationTemplate1795366145811().up(runner);
    }
    await run(runner);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
}
