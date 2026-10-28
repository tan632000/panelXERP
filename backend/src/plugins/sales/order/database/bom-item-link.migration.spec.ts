import { randomBytes } from 'crypto';

import { DataSource, type QueryRunner } from 'typeorm';

import { LinkBomLinesToItems1793230418562 } from '@plugins/sales/order/database/migrations/1793230418562-link-bom-lines-to-items';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

interface Fixture {
  items: Record<
    | 'renamed'
    | 'shared'
    | 'deletedOld'
    | 'reusedNew'
    | 'twinA'
    | 'twinB'
    | 'ambiguousActive'
    | 'catalogOnly',
    number
  >;
  quotationBom: Record<
    | 'renamed'
    | 'sharedMsb01'
    | 'reused'
    | 'ambiguous'
    | 'catalogOnly'
    | 'sharedMsb02',
    number
  >;
  orderBom: Record<'renamed' | 'reused' | 'shared', number>;
}

/**
 * The backfill runs against the real schema inside a transaction that is rolled back, so the
 * fixture never outlives the spec and the rest of the database is left as it was.
 */
describeWithDatabase('LinkBomLinesToItems backfill (real Postgres)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration = new LinkBomLinesToItems1793230418562();

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
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  beforeEach(async () => {
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
  });

  afterEach(async () => {
    await runner.rollbackTransaction();
    await runner.release();
  });

  /** `QueryRunner.query` answers `any`; every read here names the rows it expects. */
  const rowsOf = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
    runner.query(sql, params) as Promise<T[]>;

  const one = async (sql: string, params: unknown[] = []): Promise<number> => {
    const [row] = await rowsOf<{ id: number }>(`${sql} RETURNING id`, params);
    return row.id;
  };

  /**
   * Revision with panels `MSB-01` and `MSB-02`, a quotation version and an order built from
   * it, their BOM copies left unlinked (as before the migration).
   */
  async function seed(): Promise<Fixture> {
    const tag = `BL${randomBytes(4).toString('hex')}`;
    const [user] = await rowsOf<{ id: number }>(
      `SELECT id FROM users ORDER BY id LIMIT 1`,
    );
    const item = (code: string, deleted = false) =>
      one(
        `INSERT INTO items (code, name, item_group, unit, is_deleted)
         VALUES ($1, 'Link spec item', 'other', 'Cái', $2)`,
        [code, deleted],
      );

    const items = {
      renamed: await item(`${tag}-A`),
      shared: await item(`${tag}-B`),
      deletedOld: await item(`${tag}-R`, true),
      reusedNew: await item(`${tag}-R`),
      twinA: await item(`${tag}-X1`, true),
      twinB: await item(`${tag}-X2`, true),
      // An active item holding the ambiguous code today: the catalog step must not take it.
      ambiguousActive: await item(`${tag}-X`),
      catalogOnly: await item(`${tag}-L`),
    };
    // Renamed in the catalog after the estimate froze its code.
    await runner.query(`UPDATE items SET code = $2 WHERE id = $1`, [
      items.renamed,
      `${tag}-A-NEW`,
    ]);

    const customer = await one(
      `INSERT INTO customers (code, name, sales_owner_id) VALUES ($1, 'Link spec', $2)`,
      [`${tag}-C`, user.id],
    );
    const request = await one(
      `INSERT INTO sales_requests (code, customer_id, title, sales_owner_id)
       VALUES ($1, $2, 'Link spec', $3)`,
      [`YC_${tag}`, customer, user.id],
    );
    const estimate = await one(
      `INSERT INTO sales_estimates (code, request_id) VALUES ($1, $2)`,
      [`DT_${tag}`, request],
    );
    const revision = await one(
      `INSERT INTO sales_estimate_revisions (estimate_id, revision, status)
       VALUES ($1, 1, 'submitted')`,
      [estimate],
    );
    const panel = (panelTag: string) =>
      one(
        `INSERT INTO sales_estimate_panels (revision_id, tag) VALUES ($1, $2)`,
        [revision, panelTag],
      );
    const estimateLine = (panelId: number, itemId: number, code: string) =>
      one(
        `INSERT INTO sales_estimate_bom_lines
           (panel_id, item_id, item_code, item_name, item_unit, quantity, unit_cost)
         VALUES ($1, $2, $3, 'Link spec item', 'Cái', 1, 0)`,
        [panelId, itemId, code],
      );
    const msb01 = await panel('MSB-01');
    const msb02 = await panel('MSB-02');
    await estimateLine(msb01, items.renamed, `${tag}-A`);
    await estimateLine(msb01, items.shared, `${tag}-B`);
    await estimateLine(msb01, items.deletedOld, `${tag}-R`);
    // One frozen code naming two different items: nothing can say which one is meant.
    await estimateLine(msb01, items.twinA, `${tag}-X`);
    await estimateLine(msb01, items.twinB, `${tag}-X`);
    await estimateLine(msb02, items.shared, `${tag}-B`);

    const quotation = await one(
      `INSERT INTO sales_quotations (code, request_id, estimate_id) VALUES ($1, $2, $3)`,
      [`BG_${tag}`, request, estimate],
    );
    const version = await one(
      `INSERT INTO sales_quotation_versions
         (quotation_id, ver, estimate_revision_id, estimate_revision, status)
       VALUES ($1, 1, $2, 1, 'approved')`,
      [quotation, revision],
    );
    const quotationLine = (lineTag: string) =>
      one(
        `INSERT INTO sales_quotation_lines (version_id, tag, unit_cost) VALUES ($1, $2, 0)`,
        [version, lineTag],
      );
    const quotationBom = (lineId: number, code: string) =>
      one(
        `INSERT INTO sales_quotation_bom_lines (line_id, item_code, item_name, item_unit, quantity)
         VALUES ($1, $2, 'Link spec item', 'Cái', 1)`,
        [lineId, code],
      );
    // The quotation stored the tag in another case than the estimate panel.
    const qMsb01 = await quotationLine('msb-01');
    const qMsb02 = await quotationLine('MSB-02');

    const order = await one(
      `INSERT INTO sales_orders
         (code, quotation_id, quotation_version_id, quotation_ver, request_id, estimate_id,
          estimate_revision_id, estimate_revision, customer_id, customer_name)
       VALUES ($1, $2, $3, 1, $4, $5, $6, 1, $7, 'Link spec')`,
      [`DH_${tag}`, quotation, version, request, estimate, revision, customer],
    );
    const orderLine = (lineTag: string) =>
      one(
        `INSERT INTO sales_order_lines (order_id, tag, unit_price, amount) VALUES ($1, $2, 0, 0)`,
        [order, lineTag],
      );
    const orderBom = (lineId: number, code: string) =>
      one(
        `INSERT INTO sales_order_bom_lines (line_id, item_code, item_name, item_unit, quantity)
         VALUES ($1, $2, 'Link spec item', 'Cái', 1)`,
        [lineId, code],
      );
    const oMsb01 = await orderLine('msb-01');
    const oMsb02 = await orderLine('MSB-02');

    const fixture: Fixture = {
      items,
      quotationBom: {
        renamed: await quotationBom(qMsb01, `${tag}-A`),
        sharedMsb01: await quotationBom(qMsb01, `${tag}-B`),
        reused: await quotationBom(qMsb01, `${tag}-R`),
        ambiguous: await quotationBom(qMsb01, `${tag}-X`),
        // Not in the estimate: only the catalog can name it.
        catalogOnly: await quotationBom(qMsb01, `${tag}-L`),
        sharedMsb02: await quotationBom(qMsb02, `${tag}-B`),
      },
      orderBom: {
        renamed: await orderBom(oMsb01, `${tag}-A`),
        reused: await orderBom(oMsb01, `${tag}-R`),
        shared: await orderBom(oMsb02, `${tag}-B`),
      },
    };
    await runner.query(
      `UPDATE sales_quotation_bom_lines SET item_id = NULL WHERE id = ANY($1)`,
      [Object.values(fixture.quotationBom)],
    );
    await runner.query(
      `UPDATE sales_order_bom_lines SET item_id = NULL WHERE id = ANY($1)`,
      [Object.values(fixture.orderBom)],
    );
    return fixture;
  }

  const linkedIds = async (
    table: string,
    ids: Record<string, number>,
  ): Promise<Record<string, number | null>> => {
    const rows = await rowsOf<{ id: number; item_id: number | null }>(
      `SELECT id, item_id FROM ${table} WHERE id = ANY($1)`,
      [Object.values(ids)],
    );
    const byId = new Map(rows.map((row) => [row.id, row.item_id]));
    return Object.fromEntries(
      Object.entries(ids).map(([name, id]) => [name, byId.get(id) ?? null]),
    );
  };

  it('links quotation BOM lines to the estimate items, not to today’s codes', async () => {
    const fixture = await seed();
    await migration.up(runner);

    expect(
      await linkedIds('sales_quotation_bom_lines', fixture.quotationBom),
    ).toEqual({
      renamed: fixture.items.renamed,
      sharedMsb01: fixture.items.shared,
      // The code was reused by another item after the estimate: the estimate's item wins.
      reused: fixture.items.deletedOld,
      ambiguous: null,
      catalogOnly: fixture.items.catalogOnly,
      sharedMsb02: fixture.items.shared,
    });
  });

  it('links order BOM lines through the order’s estimate revision, in any tag case', async () => {
    const fixture = await seed();
    await migration.up(runner);

    expect(await linkedIds('sales_order_bom_lines', fixture.orderBom)).toEqual({
      renamed: fixture.items.renamed,
      reused: fixture.items.deletedOld,
      shared: fixture.items.shared,
    });
  });

  it('drops the columns on down', async () => {
    await migration.down(runner);
    const columns = await rowsOf<unknown>(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'item_id'
          AND table_name IN ('sales_quotation_bom_lines', 'sales_order_bom_lines')`,
    );
    expect(columns).toEqual([]);
  });
});
