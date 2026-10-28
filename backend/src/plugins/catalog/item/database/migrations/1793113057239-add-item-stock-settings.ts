import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Warehouse settings on an item: an optional barcode (unique among active rows, any case), a
 * default location and the minimum stock below which a shortage alert is raised. A blank
 * minimum means no alert.
 */
export class AddItemStockSettings1793113057239 implements MigrationInterface {
  name = 'AddItemStockSettings1793113057239';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE items
        ADD COLUMN IF NOT EXISTS barcode VARCHAR(64),
        ADD COLUMN IF NOT EXISTS default_location_id INT REFERENCES locations(id),
        ADD COLUMN IF NOT EXISTS min_stock NUMERIC(18,3),
        ADD CONSTRAINT ck_items_min_stock CHECK (min_stock IS NULL OR min_stock >= 0)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_items_barcode_active
        ON items (LOWER(barcode))
        WHERE is_deleted = false AND barcode IS NOT NULL
    `);
    // Deleting a location looks for the active items that use it.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_items_default_location
        ON items (default_location_id)
        WHERE is_deleted = false AND default_location_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_items_default_location`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_items_barcode_active`);
    await queryRunner.query(`
      ALTER TABLE items
        DROP CONSTRAINT IF EXISTS ck_items_min_stock,
        DROP COLUMN IF EXISTS min_stock,
        DROP COLUMN IF EXISTS default_location_id,
        DROP COLUMN IF EXISTS barcode
    `);
  }
}
