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
 * Installations at the project and their photos. Rows are never deleted.
 *
 * - `order_id` carries no foreign key: the sales order is locked by its own writers through the
 *   sales port, and a key share on it from here would stand in the global lock order.
 * - At most one installation per order: the partial unique index is the backstop of the check
 *   the service makes under the order lock.
 * - The per-installation photo limit is the service's to check under the order lock.
 */
export class InitInstallations1794845383917 implements MigrationInterface {
  name = 'InitInstallations1794845383917';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS installations (
        id SERIAL PRIMARY KEY,
        order_id INT NOT NULL,
        site_address VARCHAR(500),
        planned_date DATE,
        person_in_charge VARCHAR(255),
        note VARCHAR(2000),
        status VARCHAR(12) NOT NULL DEFAULT 'planned'
          CHECK (status IN ('planned', 'in_progress', 'done')),
        started_at TIMESTAMPTZ,
        started_by INT REFERENCES users(id),
        done_at TIMESTAMPTZ,
        done_by INT REFERENCES users(id),${AUDIT_COLUMNS}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_installations_order
        ON installations (order_id) WHERE is_deleted = false
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS installation_photos (
        id SERIAL PRIMARY KEY,
        installation_id INT NOT NULL REFERENCES installations(id),
        storage_key VARCHAR(255) NOT NULL,
        content_type VARCHAR(50) NOT NULL
          CHECK (content_type IN ('image/png', 'image/jpeg')),
        file_name VARCHAR(150) NOT NULL,
        size_bytes INT NOT NULL,${AUDIT_COLUMNS}
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_installation_photos_installation
        ON installation_photos (installation_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS installation_photos`);
    await queryRunner.query(`DROP TABLE IF EXISTS installations`);
  }
}
