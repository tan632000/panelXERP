import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Projects (DA) of a customer. The code is unique among active rows only: a soft-deleted
 * project frees its code, so the index is partial on `is_deleted = false`.
 */
export class InitProject1792823066770 implements MigrationInterface {
  name = 'InitProject1792823066770';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        customer_id INT NOT NULL REFERENCES customers(id),
        name VARCHAR(255) NOT NULL,
        site_address VARCHAR(500),
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_code_active
        ON projects (LOWER(code))
        WHERE is_deleted = false
    `);

    // Visibility follows the customer's owner, and the customer delete asks for its projects.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_projects_customer_id
        ON projects (customer_id)
        WHERE is_deleted = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_projects_customer_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_projects_code_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS projects CASCADE`);
  }
}
