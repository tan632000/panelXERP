import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customers (KH). The code is unique among active rows only: a soft-deleted customer frees
 * its code, so the index is partial on `is_deleted = false`.
 */
export class InitCustomer1792771571988 implements MigrationInterface {
  name = 'InitCustomer1792771571988';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        name VARCHAR(255) NOT NULL,
        tax_code VARCHAR(20),
        address VARCHAR(500),
        phone VARCHAR(20),
        email VARCHAR(255),
        sales_owner_id INT NOT NULL REFERENCES users(id),
        note TEXT,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_code_active
        ON customers (LOWER(code))
        WHERE is_deleted = false
    `);

    // A Sales actor's every list and lookup filters on the owner.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_customers_sales_owner_id
        ON customers (sales_owner_id)
        WHERE is_deleted = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_customers_sales_owner_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_customers_code_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS customers CASCADE`);
  }
}
