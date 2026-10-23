import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contacts of a customer. The unique index keeps at most one active primary contact per
 * customer; it is partial on `is_deleted = false` so a deleted primary frees the slot.
 */
export class InitContact1792771589412 implements MigrationInterface {
  name = 'InitContact1792771589412';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        customer_id INT NOT NULL REFERENCES customers(id),
        name VARCHAR(255) NOT NULL,
        position VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(255),
        is_primary BOOLEAN NOT NULL DEFAULT false,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_primary_per_customer
        ON contacts (customer_id)
        WHERE is_primary = true AND is_deleted = false
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_contacts_customer_id
        ON contacts (customer_id)
        WHERE is_deleted = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_contacts_customer_id`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_contacts_primary_per_customer`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS contacts CASCADE`);
  }
}
