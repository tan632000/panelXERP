import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suppliers. The code is unique among active rows only: a soft-deleted supplier frees its
 * code, so the index is partial on `is_deleted = false`.
 */
export class InitSupplier1793108442602 implements MigrationInterface {
  name = 'InitSupplier1793108442602';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        tax_code VARCHAR(20),
        address VARCHAR(500),
        phone VARCHAR(20),
        email VARCHAR(255),
        contact_name VARCHAR(255),
        note TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by INT REFERENCES users(id),
        updated_by INT REFERENCES users(id),
        deleted_at TIMESTAMPTZ,
        deleted_by INT REFERENCES users(id),
        is_deleted BOOLEAN NOT NULL DEFAULT false
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_code_active
        ON suppliers (LOWER(code))
        WHERE is_deleted = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_suppliers_code_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS suppliers CASCADE`);
  }
}
