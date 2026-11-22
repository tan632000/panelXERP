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
 * Delivery notes, the cabinets on them and the handover files of a receipt. Rows are never
 * deleted.
 *
 * - The code is a document number: its unique index counts deleted rows, so an issued number
 *   is never reused (creates retry a lost race).
 * - `order_id` carries no foreign key: the sales order is locked by its own writers through the
 *   sales port, and a key share on it from here would stand in the global lock order.
 * - A cabinet is on at most one live note: the partial unique index over active lines is the
 *   backstop of the check the service makes under the order lock. Cancelling a note clears
 *   `active` in the same transaction.
 */
export class InitDeliveryNotes1794758983917 implements MigrationInterface {
  name = 'InitDeliveryNotes1794758983917';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS delivery_notes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        order_id INT NOT NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'shipped', 'received', 'cancelled')),
        planned_date DATE,
        delivery_address VARCHAR(500),
        note VARCHAR(1000),
        shipped_at TIMESTAMPTZ,
        shipped_by INT REFERENCES users(id),
        received_date DATE,
        receiver_name VARCHAR(255),
        received_by INT REFERENCES users(id),
        cancel_reason VARCHAR(1000),
        cancelled_at TIMESTAMPTZ,
        cancelled_by INT REFERENCES users(id),${AUDIT_COLUMNS}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_notes_code
        ON delivery_notes (code)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_delivery_notes_order
        ON delivery_notes (order_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS delivery_note_units (
        id SERIAL PRIMARY KEY,
        note_id INT NOT NULL REFERENCES delivery_notes(id),
        unit_id INT NOT NULL REFERENCES production_units(id),
        unit_code VARCHAR(60) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,${AUDIT_COLUMNS}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_note_units_active
        ON delivery_note_units (unit_id) WHERE active = true AND is_deleted = false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_delivery_note_units_note
        ON delivery_note_units (note_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS delivery_note_files (
        id SERIAL PRIMARY KEY,
        note_id INT NOT NULL REFERENCES delivery_notes(id),
        storage_key VARCHAR(255) NOT NULL,
        content_type VARCHAR(50) NOT NULL
          CHECK (content_type IN ('application/pdf', 'image/png', 'image/jpeg')),
        file_name VARCHAR(150) NOT NULL,
        size_bytes INT NOT NULL,${AUDIT_COLUMNS}
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_delivery_note_files_note
        ON delivery_note_files (note_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS delivery_note_files`);
    await queryRunner.query(`DROP TABLE IF EXISTS delivery_note_units`);
    await queryRunner.query(`DROP TABLE IF EXISTS delivery_notes`);
  }
}
