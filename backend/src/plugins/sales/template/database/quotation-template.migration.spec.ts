import { ITEM_IN_LIVE_TEMPLATE_SQL } from '@plugins/sales/template/constants/quotation-template.constant';
import { InitQuotationTemplate1795366145811 } from '@plugins/sales/template/database/migrations/1795366145811-init-quotation-template';
import {
  connectScratchDataSource,
  inScratchSchema,
} from '@plugins/sales/template/database/quotation-template-scratch.helper-spec';

import type { DataSource, QueryRunner } from 'typeorm';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

const TABLES = [
  'quotation_template_lines',
  'quotation_template_panels',
  'quotation_templates',
];

describeWithDatabase('InitQuotationTemplate (real Postgres)', () => {
  const migration = new InitQuotationTemplate1795366145811();
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await connectScratchDataSource();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  const existingTables = async (runner: QueryRunner): Promise<string[]> =>
    (
      (await runner.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name LIKE 'quotation_template%'
          ORDER BY table_name`,
      )) as Array<{ table_name: string }>
    ).map((row) => row.table_name);

  /** Fails inside a savepoint so the transaction stays usable for the next statement. */
  async function expectViolation(
    runner: QueryRunner,
    sql: string,
    code: string,
  ): Promise<void> {
    await runner.query('SAVEPOINT attempt');
    await expect(runner.query(sql)).rejects.toMatchObject({ code });
    await runner.query('ROLLBACK TO SAVEPOINT attempt');
  }

  const insertTemplate = async (
    runner: QueryRunner,
    code: string,
  ): Promise<number> =>
    (
      (await runner.query(
        `INSERT INTO quotation_templates (code, name) VALUES ('${code}', 'Template') RETURNING id`,
      )) as Array<{ id: number }>
    )[0].id;

  const insertPanel = (templateId: number, tag: string): string =>
    `INSERT INTO quotation_template_panels (template_id, tag) VALUES (${templateId}, '${tag}')`;

  const insertItem = (runner: QueryRunner) =>
    runner.query(
      `INSERT INTO items (code, name, item_group, unit) VALUES ('ML22-22', 'Den bao pha', 'accessory', 'Cai')`,
    );

  it('creates the three tables and removes them all on down', async () => {
    await inScratchSchema(
      dataSource,
      async (runner) => {
        expect(await existingTables(runner)).toEqual([]);
        await migration.up(runner);
        expect(await existingTables(runner)).toEqual(TABLES);
        await migration.down(runner);
        expect(await existingTables(runner)).toEqual([]);
      },
      { migrate: false },
    );
  });

  it('keeps the template code unique among live rows, ignoring case, and frees it on delete', async () => {
    await inScratchSchema(dataSource, async (runner) => {
      await insertTemplate(runner, 'TPL_0001');
      await expectViolation(
        runner,
        `INSERT INTO quotation_templates (code, name) VALUES ('tpl_0001', 'Other')`,
        '23505',
      );

      await runner.query(
        `UPDATE quotation_templates SET is_deleted = true WHERE code = 'TPL_0001'`,
      );
      await insertTemplate(runner, 'TPL_0001');
    });
  });

  it('keeps a panel tag unique per template, ignoring case', async () => {
    await inScratchSchema(dataSource, async (runner) => {
      const first = await insertTemplate(runner, 'TPL_0001');
      const second = await insertTemplate(runner, 'TPL_0002');

      await runner.query(insertPanel(first, 'TDT1'));
      await expectViolation(runner, insertPanel(first, 'tdt1'), '23505');
      await runner.query(insertPanel(second, 'TDT1'));
    });
  });

  it('refuses a line with an unknown item or a non-positive quantity', async () => {
    await inScratchSchema(dataSource, async (runner) => {
      await runner.query(
        insertPanel(await insertTemplate(runner, 'TPL_0001'), 'P1'),
      );
      await insertItem(runner);
      const insertLine = (itemId: number, quantity: number) =>
        `INSERT INTO quotation_template_lines (panel_id, item_id, quantity) VALUES (1, ${itemId}, ${quantity})`;

      await expectViolation(runner, insertLine(999, 1), '23503');
      await expectViolation(runner, insertLine(1, 0), '23514');
      await runner.query(insertLine(1, 3));
    });
  });

  it('blocks deleting an item a template uses, and reports it only while the template is live', async () => {
    await inScratchSchema(dataSource, async (runner) => {
      const templateId = await insertTemplate(runner, 'TPL_0001');
      await runner.query(insertPanel(templateId, 'P1'));
      await insertItem(runner);
      await runner.query(
        `INSERT INTO quotation_template_lines (panel_id, item_id, quantity) VALUES (1, 1, 3)`,
      );

      await expectViolation(runner, `DELETE FROM items WHERE id = 1`, '23503');
      const used = (): Promise<unknown[]> =>
        runner.query(ITEM_IN_LIVE_TEMPLATE_SQL, [1]);
      expect(await used()).toHaveLength(1);

      await runner.query(
        `UPDATE quotation_templates SET is_deleted = true WHERE id = ${templateId}`,
      );
      expect(await used()).toHaveLength(0);
    });
  });
});
