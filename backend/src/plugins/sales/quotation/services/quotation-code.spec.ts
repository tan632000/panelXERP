import { randomBytes } from 'crypto';

import { DataSource } from 'typeorm';

import {
  createWithDocumentCode,
  dailyDocumentCode,
  salesDocumentDate,
} from '@plugins/sales/_shared/utils/sales-document-code.util';
import { describeWithDatabase } from '@plugins/sales/quotation/quotation-db.helper-spec';

describe('salesDocumentDate', () => {
  it('reads the day at the shop: 17:30 UTC on 31 December is already 1 January', () => {
    expect(salesDocumentDate(new Date('2026-12-31T17:30:00Z'))).toBe(
      '01012027',
    );
  });

  it('stays on the old day until midnight in Ho Chi Minh', () => {
    expect(salesDocumentDate(new Date('2026-09-08T16:59:59Z'))).toBe(
      '08092026',
    );
    expect(salesDocumentDate(new Date('2026-09-08T17:00:00Z'))).toBe(
      '09092026',
    );
  });
});

/**
 * The per-day `NN-ddmmyyyy/BG` numbering against a scratch table with the same code shape and
 * unique index as `sales_quotations`, so no estimate or request has to exist for each number.
 */
describeWithDatabase('dailyDocumentCode against Postgres', () => {
  const table = `tmp_daily_code_${randomBytes(4).toString('hex')}`;
  const index = `uq_${table}_code`;
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
    await dataSource.query(
      `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, code VARCHAR(30) NOT NULL)`,
    );
    await dataSource.query(`CREATE UNIQUE INDEX ${index} ON ${table} (code)`);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP TABLE IF EXISTS ${table}`);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM ${table}`);
  });

  const issue = (now: string, pause = 0) =>
    createWithDocumentCode(
      dataSource,
      {
        table,
        prefix: 'BG',
        codeUniqueIndex: index,
        format: dailyDocumentCode,
        exhaustedMessage: 'Could not allocate a code.',
        clock: () => new Date(now),
        maxAttempts: 10,
      },
      async (manager, code) => {
        // Holding the transaction open lets concurrent creators read the same highest number.
        if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
        await manager.query(`INSERT INTO ${table} (code) VALUES ($1)`, [code]);
        return code;
      },
    );

  it('numbers two documents of one day 01 and 02, and restarts at 01 the next day', async () => {
    const day = '2026-09-08T03:00:00Z';

    expect(await issue(day)).toBe('01-08092026/BG');
    expect(await issue(day)).toBe('02-08092026/BG');
    expect(await issue('2026-09-09T03:00:00Z')).toBe('01-09092026/BG');
  });

  it('dates a document by the Vietnam day: 2026-12-31T17:30:00Z → 01012027', async () => {
    expect(await issue('2026-12-31T17:30:00Z')).toBe('01-01012027/BG');
    expect(await issue('2026-12-31T16:30:00Z')).toBe('01-31122026/BG');
  });

  it('keeps counting past two digits', async () => {
    await dataSource.query(
      `INSERT INTO ${table} (code) VALUES ('99-08092026/BG')`,
    );

    expect(await issue('2026-09-08T03:00:00Z')).toBe('100-08092026/BG');
  });

  it('gives concurrent creators distinct numbers by retrying the lost ones', async () => {
    const day = '2026-09-08T03:00:00Z';

    const codes = await Promise.all([
      issue(day, 40),
      issue(day, 40),
      issue(day, 40),
      issue(day, 40),
    ]);

    expect([...codes].sort()).toEqual([
      '01-08092026/BG',
      '02-08092026/BG',
      '03-08092026/BG',
      '04-08092026/BG',
    ]);
  });
});
