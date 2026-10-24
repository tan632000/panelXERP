import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Item catalog. The code is unique among active rows only (case-insensitive): a soft-deleted
 * item frees its code, so the index is partial on `is_deleted = false`.
 */
export class InitItem1792824482281 implements MigrationInterface {
  name = 'InitItem1792824482281';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        specification TEXT,
        brand VARCHAR(255),
        item_group VARCHAR(20) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        reference_price NUMERIC(18,2),
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by INT REFERENCES users(id),
        updated_by INT REFERENCES users(id),
        deleted_at TIMESTAMPTZ,
        deleted_by INT REFERENCES users(id),
        is_deleted BOOLEAN NOT NULL DEFAULT false,
        CONSTRAINT ck_items_reference_price CHECK (reference_price IS NULL OR reference_price >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_items_code_active
        ON items (LOWER(code))
        WHERE is_deleted = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_items_code_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS items CASCADE`);
  }
}
