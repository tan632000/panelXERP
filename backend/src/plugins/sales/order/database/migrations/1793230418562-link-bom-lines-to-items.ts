import { Logger } from '@nestjs/common';

import type { MigrationInterface, QueryRunner } from 'typeorm';

/** The two frozen BOM copies, each with the path from its panel line to the estimate revision. */
const SNAPSHOTS = [
  {
    table: 'sales_quotation_bom_lines',
    index: 'ix_sales_quotation_bom_lines_item_id',
    // A quotation line's panel lives in the revision its version was built from.
    revisionOf: `
      FROM sales_quotation_lines pl
      JOIN sales_quotation_versions doc ON doc.id = pl.version_id`,
  },
  {
    table: 'sales_order_bom_lines',
    index: 'ix_sales_order_bom_lines_item_id',
    revisionOf: `
      FROM sales_order_lines pl
      JOIN sales_orders doc ON doc.id = pl.order_id`,
  },
] as const;

/**
 * Links every quotation and order BOM line to its catalog item, so material demand never joins
 * by code: a code is reusable once its item is deleted, and an item may be renamed after the
 * estimate.
 *
 * The backfill follows the estimate the document was built from: panel line tag (any case) and
 * the document's estimate revision lead to the estimate panel, whose BOM line with the same
 * frozen code names the item. A code the estimate holds for two different items stays NULL,
 * also afterwards. Only a line the estimate does not hold at all is matched against the
 * catalog, and only to the single active item with that code.
 */
export class LinkBomLinesToItems1793230418562 implements MigrationInterface {
  name = 'LinkBomLinesToItems1793230418562';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, index, revisionOf } of SNAPSHOTS) {
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS item_id INT NULL REFERENCES items(id)`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS ${index} ON ${table} (item_id)`,
      );

      await queryRunner.query(`
        UPDATE ${table} bom SET item_id = linked.item_id
        FROM (
          SELECT b.id, MIN(eb.item_id) AS item_id
            FROM ${table} b
            JOIN (SELECT pl.id, pl.tag, doc.estimate_revision_id ${revisionOf}) pl
              ON pl.id = b.line_id
            JOIN sales_estimate_panels ep
              ON ep.revision_id = pl.estimate_revision_id AND lower(ep.tag) = lower(pl.tag)
            JOIN sales_estimate_bom_lines eb
              ON eb.panel_id = ep.id AND eb.item_code = b.item_code
           WHERE b.item_id IS NULL
           GROUP BY b.id
          HAVING COUNT(DISTINCT eb.item_id) = 1
        ) linked
        WHERE bom.id = linked.id
      `);

      await queryRunner.query(`
        UPDATE ${table} bom SET item_id = active.id
        FROM (
          SELECT lower(code) AS code, MIN(id) AS id
            FROM items
           WHERE is_deleted = false
           GROUP BY lower(code)
          HAVING COUNT(*) = 1
        ) active
        WHERE bom.item_id IS NULL AND lower(bom.item_code) = active.code
          -- The estimate already answered for this code (with two items, so ambiguously):
          -- today's catalog must not overrule it.
          AND NOT EXISTS (
            SELECT 1
              FROM (SELECT pl.id, pl.tag, doc.estimate_revision_id ${revisionOf}) pl
              JOIN sales_estimate_panels ep
                ON ep.revision_id = pl.estimate_revision_id AND lower(ep.tag) = lower(pl.tag)
              JOIN sales_estimate_bom_lines eb
                ON eb.panel_id = ep.id AND eb.item_code = bom.item_code
             WHERE pl.id = bom.line_id
          )
      `);

      const [{ unlinked }] = (await queryRunner.query(
        `SELECT COUNT(*) AS unlinked FROM ${table} WHERE item_id IS NULL`,
      )) as Array<{ unlinked: string }>;
      new Logger(LinkBomLinesToItems1793230418562.name).log(
        `${table}: ${unlinked} line(s) left without an item link`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, index } of SNAPSHOTS) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${index}`);
      await queryRunner.query(
        `ALTER TABLE ${table} DROP COLUMN IF EXISTS item_id`,
      );
    }
  }
}
