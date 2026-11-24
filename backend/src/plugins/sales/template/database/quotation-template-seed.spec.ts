import { ITEM_GROUPS } from '@plugins/catalog/item/enums/item-group.enum';
import {
  connectScratchDataSource,
  inScratchSchema,
} from '@plugins/sales/template/database/quotation-template-scratch.helper-spec';
import { insertQuotationTemplates } from '@plugins/sales/template/database/seed-quotation-templates';

import type { DataSource, QueryRunner } from 'typeorm';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

/** What the five source sheets in docs/baogia hold: panels, and lines that carry a part number. */
const EXPECTED = [
  { code: 'TPL_0001', panels: 1, lines: 21 },
  { code: 'TPL_0002', panels: 1, lines: 9 },
  { code: 'TPL_0003', panels: 1, lines: 7 },
  { code: 'TPL_0004', panels: 1, lines: 7 },
  { code: 'TPL_0005', panels: 8, lines: 127 },
];

/** The distinct part numbers each source sheet carries; a swapped or invented code changes a set. */
const EXPECTED_CODES: Record<string, string[]> = {
  TPL_0001: [
    '12038 HSL',
    '1800x800x400',
    '61F-GP-N',
    'BCL63E0CG-2P010',
    'BCL63E0CG-3P020',
    'BCL63E0CG-3P032',
    'BW32AAG 3P 10A',
    'DF2CA02',
    'FRN0018C2S-4A',
    'FRN0029E3S-4G',
    'KTP900 Basic 6AV2123-2JB03-0AX0',
    'RXM2LB2P7',
    'S8VK-C12024',
    'SC-4-1',
    'VAF36A',
    'XA2AD33',
  ],
  TPL_0002: [
    '500x350x200',
    'BCL63E0CG-3P010',
    'ML11',
    'ML11D',
    'ML22-22',
    'MLST',
    'RT 18-32X',
    'SC-03',
    'TR-0N(5–8)',
  ],
  TPL_0003: [
    '700x500x250',
    'ABN103c 3P 100A',
    'LA63N 1P 16A',
    'LA63N 3P 16A',
    'LA63N 3P 32A',
    'ML22-22',
    'RT 18-32X',
  ],
  // LSX-127 has no part number on its enclosure row, so TPL_0004 has no enclosure line.
  TPL_0004: [
    'B60020WN',
    'BCL63E0CG-3P040',
    'BW100EAG-3P',
    'BW253E0 3P 200A',
    'ML20X',
    'ML22-22',
    'RT 18-32X',
  ],
  TPL_0005: [
    'BCL63E0CG-1P006',
    'BCL63E0CG-2P032',
    'BCL63E0CG-2P040',
    'BCL63E0CG-3P032',
    'BCL63E0CG-3P040',
    'BW163E0 3P 150A',
    'BW253E0 3P 200A',
    'BW253E0 3P 250A',
    'BW32AAG 3P 20A',
    'BW32AAG-3P30',
    'BW50EAG-3P040',
    'BW63RAG-3P',
    'BW800EAG-3P',
    'MFM383A',
    'ML',
    'ML22-22',
    'ML96',
    'MSQ',
    'RT 18-32X',
    'SC-4-1',
    'SC-5-1',
    'SC-N1',
    'SC-N2',
    'TS2M1-1-16A-230V',
  ],
};

describeWithDatabase('seed quotation templates (real Postgres)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await connectScratchDataSource();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  const count = async (runner: QueryRunner, table: string): Promise<number> =>
    Number(
      (
        (await runner.query(`SELECT COUNT(*) AS n FROM ${table}`)) as Array<{
          n: string;
        }>
      )[0].n,
    );

  const countsOf = async (runner: QueryRunner): Promise<number[]> => [
    await count(runner, 'items'),
    await count(runner, 'quotation_templates'),
    await count(runner, 'quotation_template_panels'),
    await count(runner, 'quotation_template_lines'),
  ];

  it('seeds the five templates with the source panel and line counts', async () => {
    await inScratchSchema(dataSource, async (runner) => {
      await insertQuotationTemplates(runner.manager);

      const rows = (await runner.query(
        `SELECT t.code,
                COUNT(DISTINCT p.id)::int AS panels,
                COUNT(l.id)::int AS lines
           FROM quotation_templates t
           JOIN quotation_template_panels p ON p.template_id = t.id
           LEFT JOIN quotation_template_lines l ON l.panel_id = p.id
          GROUP BY t.code ORDER BY t.code`,
      )) as Array<{ code: string; panels: number; lines: number }>;
      expect(rows).toEqual(EXPECTED);

      const sockets = (await runner.query(
        `SELECT p.quantity FROM quotation_template_panels p
           JOIN quotation_templates t ON t.id = p.template_id WHERE t.code = 'TPL_0003'`,
      )) as Array<{ quantity: number }>;
      expect(sockets).toEqual([{ quantity: 3 }]);
    });
  });

  it('uses exactly the part numbers of each source sheet', async () => {
    await inScratchSchema(dataSource, async (runner) => {
      await insertQuotationTemplates(runner.manager);

      const rows = (await runner.query(
        `SELECT t.code AS template, i.code AS item
           FROM quotation_templates t
           JOIN quotation_template_panels p ON p.template_id = t.id
           JOIN quotation_template_lines l ON l.panel_id = p.id
           JOIN items i ON i.id = l.item_id`,
      )) as Array<{ template: string; item: string }>;
      const actual: Record<string, string[]> = {};
      for (const { template, item } of rows) {
        (actual[template] ??= []).push(item);
      }
      for (const codes of Object.values(actual)) {
        codes.splice(0, codes.length, ...[...new Set(codes)].sort());
      }
      const expected = Object.fromEntries(
        Object.entries(EXPECTED_CODES).map(([code, list]) => [
          code,
          [...list].sort(),
        ]),
      );
      expect(actual).toEqual(expected);
    });
  });

  it('points every line at a live item of a known group and stores no price anywhere', async () => {
    await inScratchSchema(dataSource, async (runner) => {
      await insertQuotationTemplates(runner.manager);

      const dangling = (await runner.query(
        `SELECT 1 FROM quotation_template_lines l
          LEFT JOIN items i ON i.id = l.item_id AND i.is_deleted = false
          WHERE i.id IS NULL`,
      )) as unknown[];
      expect(dangling).toHaveLength(0);

      const groups = (
        (await runner.query(`SELECT DISTINCT item_group FROM items`)) as Array<{
          item_group: string;
        }>
      ).map((row) => row.item_group);
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) expect(ITEM_GROUPS).toContain(group);

      const priced = (await runner.query(
        `SELECT 1 FROM items WHERE reference_price IS NOT NULL`,
      )) as unknown[];
      expect(priced).toHaveLength(0);
      const priceColumns = (await runner.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name LIKE 'quotation_template%'
            AND column_name ~ '(price|cost|amount|total)'`,
      )) as unknown[];
      expect(priceColumns).toHaveLength(0);
    });
  });

  it('adds nothing on a second run and reuses an existing item whatever its code casing', async () => {
    await inScratchSchema(dataSource, async (runner) => {
      await runner.query(
        `INSERT INTO items (code, name, item_group, unit, reference_price)
         VALUES ('ml22-22', 'Existing lamp', 'other', 'Cai', 1000)`,
      );

      await insertQuotationTemplates(runner.manager);
      const afterFirst = await countsOf(runner);
      await insertQuotationTemplates(runner.manager);

      expect(await countsOf(runner)).toEqual(afterFirst);
      const reused = (await runner.query(
        `SELECT code, name, item_group, reference_price FROM items WHERE LOWER(code) = 'ml22-22'`,
      )) as Array<Record<string, string>>;
      expect(reused).toEqual([
        {
          code: 'ml22-22',
          name: 'Existing lamp',
          item_group: 'other',
          reference_price: '1000.00',
        },
      ]);
    });
  });
});
