import type { MigrationInterface, QueryRunner } from 'typeorm';

const AUDIT_COLUMNS = `
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by INT REFERENCES users(id),
        updated_by INT REFERENCES users(id),
        deleted_at TIMESTAMPTZ,
        deleted_by INT REFERENCES users(id),
        is_deleted BOOLEAN NOT NULL DEFAULT false`;

/**
 * Acceptance minutes of an order and their files. Rows are never deleted.
 *
 * - `order_id` carries no foreign key: the sales order is locked by its own writers through the
 *   sales port, and a key share on it from here would stand in the global lock order.
 * - At most one acceptance per order: the partial unique index is the backstop of the check the
 *   service makes under the order lock; it also serves the reads by order.
 * - The file count (1 to 10) is the service's to check.
 */
export class InitAcceptances1794931783917 implements MigrationInterface {
  name = 'InitAcceptances1794931783917';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS acceptances (
        id SERIAL PRIMARY KEY,
        order_id INT NOT NULL,
        representative_name VARCHAR(255) NOT NULL,
        signed_date DATE NOT NULL,${AUDIT_COLUMNS}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_acceptances_order
        ON acceptances (order_id) WHERE is_deleted = false
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS acceptance_files (
        id SERIAL PRIMARY KEY,
        acceptance_id INT NOT NULL REFERENCES acceptances(id),
        storage_key VARCHAR(255) NOT NULL,
        content_type VARCHAR(50) NOT NULL
          CHECK (content_type IN ('application/pdf', 'image/png', 'image/jpeg')),
        file_name VARCHAR(150) NOT NULL,
        size_bytes INT NOT NULL,${AUDIT_COLUMNS}
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_acceptance_files_acceptance
        ON acceptance_files (acceptance_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS acceptance_files`);
    await queryRunner.query(`DROP TABLE IF EXISTS acceptances`);
  }
}
