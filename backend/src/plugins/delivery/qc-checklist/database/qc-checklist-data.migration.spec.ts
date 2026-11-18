import { DataSource, type QueryRunner } from 'typeorm';

import { QC_CHECKLIST_FEATURE } from '@plugins/delivery/delivery.features';
import { InsertDefaultQcChecklistItems1794585617331 } from '@plugins/delivery/qc-checklist/database/migrations/1794585617331-insert-default-qc-checklist-items';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

const DEFAULT_ITEMS = [
  'Vỏ tủ, sơn và cánh cửa',
  'Siết lực đầu cốt, thanh cái',
  'Đấu dây đúng bản vẽ',
  'Đánh số dây và đầu cốt',
  'Đo điện trở cách điện',
  'Kiểm tra nối đất',
  'Thử không tải',
  'Thử chức năng và liên động',
  'Tem nhãn và biển tên',
  'Tài liệu kèm theo (bản vẽ, catalogue, biên bản thử)',
];

interface ItemRow {
  name: string;
  position: number;
  active: boolean;
}

/**
 * The migration runs against a copy of the table in a schema of its own, inside a transaction
 * that is always rolled back. Only that schema is on the search path (`SET LOCAL`) and the
 * migration names its table unqualified, so it never reaches the real table.
 */
describeWithDatabase('InsertDefaultQcChecklistItems (real Postgres)', () => {
  const migration = new InsertDefaultQcChecklistItems1794585617331();
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
      const schema = `scratch_qc_checklist_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      await runner.query(`CREATE SCHEMA ${schema}`);
      await runner.query(`SET LOCAL search_path TO ${schema}`);
      await runner.query(`
        CREATE TABLE qc_checklist_items (
          id SERIAL PRIMARY KEY,
          name VARCHAR(200) NOT NULL,
          position INT NOT NULL,
          active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_by INT,
          updated_by INT,
          deleted_at TIMESTAMPTZ,
          deleted_by INT,
          is_deleted BOOLEAN NOT NULL DEFAULT false
        )
      `);
      await run(runner);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  }

  const rows = (runner: QueryRunner) =>
    runner.query(
      `SELECT name, position, active FROM qc_checklist_items ORDER BY position`,
    ) as Promise<ItemRow[]>;

  it('inserts the ten default items at positions 1 to 10 into an empty table', async () => {
    await inScratchSchema(async (runner) => {
      await migration.up(runner);

      expect(await rows(runner)).toEqual(
        DEFAULT_ITEMS.map((name, index) => ({
          name,
          position: index + 1,
          active: true,
        })),
      );
    });
  });

  it('inserts nothing when the table already holds a row', async () => {
    await inScratchSchema(async (runner) => {
      await runner.query(
        `INSERT INTO qc_checklist_items (name, position) VALUES ('Hạng mục riêng', 1)`,
      );

      await migration.up(runner);

      expect(await rows(runner)).toEqual([
        { name: 'Hạng mục riêng', position: 1, active: true },
      ]);
    });
  });

  it('is idempotent and counts a hidden or deleted row as content', async () => {
    await inScratchSchema(async (runner) => {
      await migration.up(runner);
      await migration.up(runner);
      expect(await rows(runner)).toHaveLength(10);

      await runner.query(`DELETE FROM qc_checklist_items`);
      await runner.query(
        `INSERT INTO qc_checklist_items (name, position, active, is_deleted)
         VALUES ('Đã xoá', 1, false, true)`,
      );
      await migration.up(runner);
      expect(await rows(runner)).toHaveLength(1);
    });
  });

  it('removes only the default items on down', async () => {
    await inScratchSchema(async (runner) => {
      await migration.up(runner);
      await runner.query(
        `INSERT INTO qc_checklist_items (name, position) VALUES ('Hạng mục riêng', 11)`,
      );

      await migration.down(runner);

      expect(await rows(runner)).toEqual([
        { name: 'Hạng mục riêng', position: 11, active: true },
      ]);
    });
  });

  describe('on a migrated database', () => {
    it('holds the items from the migration, not from a feature seed', async () => {
      expect(QC_CHECKLIST_FEATURE.seed).toBeUndefined();

      const recorded: Array<{ name: string }> = await dataSource.query(
        `SELECT name FROM migrations WHERE name = $1`,
        ['InsertDefaultQcChecklistItems1794585617331'],
      );
      expect(recorded).toHaveLength(1);

      const [{ count }]: Array<{ count: string }> = await dataSource.query(
        `SELECT COUNT(*) AS count FROM qc_checklist_items WHERE is_deleted = false`,
      );
      expect(Number(count)).toBeGreaterThanOrEqual(1);
    });
  });
});
