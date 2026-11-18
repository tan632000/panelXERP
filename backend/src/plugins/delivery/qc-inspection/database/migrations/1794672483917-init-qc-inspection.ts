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
 * QC rounds per cabinet, the checklist snapshot each round took, and the defects a failed item
 * opens. Rows are never deleted. A round item keeps the template item's id only as a reference:
 * its name and position are copies, so the snapshot stands whatever happens to the template. The partial unique indexes are the database backstop of the
 * rules the service checks under the cabinet lock: one round number per cabinet, at most one
 * passed round per cabinet, exactly one defect per failed item.
 */
export class InitQcInspection1794672483917 implements MigrationInterface {
  name = 'InitQcInspection1794672483917';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS qc_rounds (
        id SERIAL PRIMARY KEY,
        unit_id INT NOT NULL REFERENCES production_units(id),
        round_no INT NOT NULL,
        inspector_id INT NOT NULL REFERENCES users(id),
        inspected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        result VARCHAR(10) NOT NULL CHECK (result IN ('passed', 'failed')),${AUDIT_COLUMNS}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_rounds_unit_round
        ON qc_rounds (unit_id, round_no) WHERE is_deleted = false
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_rounds_unit_passed
        ON qc_rounds (unit_id) WHERE result = 'passed' AND is_deleted = false
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS qc_round_items (
        id SERIAL PRIMARY KEY,
        round_id INT NOT NULL REFERENCES qc_rounds(id),
        checklist_item_id INT NOT NULL,
        name VARCHAR(200) NOT NULL,
        position INT NOT NULL,
        result VARCHAR(4) NOT NULL CHECK (result IN ('pass', 'fail', 'na')),
        note VARCHAR(1000),${AUDIT_COLUMNS}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_round_items_round_item
        ON qc_round_items (round_id, checklist_item_id) WHERE is_deleted = false
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS qc_defects (
        id SERIAL PRIMARY KEY,
        unit_id INT NOT NULL REFERENCES production_units(id),
        round_item_id INT NOT NULL REFERENCES qc_round_items(id),
        description VARCHAR(1000) NOT NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'fixed', 'verified')),
        fix_note VARCHAR(1000),
        fixed_by INT REFERENCES users(id),
        fixed_at TIMESTAMPTZ,
        verified_by INT REFERENCES users(id),
        verified_at TIMESTAMPTZ,${AUDIT_COLUMNS}
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_defects_round_item
        ON qc_defects (round_item_id) WHERE is_deleted = false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_qc_defects_unit_status
        ON qc_defects (unit_id, status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS qc_defects`);
    await queryRunner.query(`DROP TABLE IF EXISTS qc_round_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS qc_rounds`);
  }
}
