import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The QC checklist template shared by every cabinet. Items are hidden, never deleted; a name is
 * unique ignoring case among the rows not deleted.
 */
export class InitQcChecklist1794585517529 implements MigrationInterface {
  name = 'InitQcChecklist1794585517529';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS qc_checklist_items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
        position INT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_checklist_items_name_lower
        ON qc_checklist_items (lower(name)) WHERE is_deleted = false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_qc_checklist_items_position
        ON qc_checklist_items (position, id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS qc_checklist_items`);
  }
}
