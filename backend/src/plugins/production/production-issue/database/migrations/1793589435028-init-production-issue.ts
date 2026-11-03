import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Problems a technician reports on a cabinet's stage. Open issues never block a stage. The
 * photos of a cabinet may be attached to one issue, so their `issue_id` gets its key here.
 */
export class InitProductionIssue1793589435028 implements MigrationInterface {
  name = 'InitProductionIssue1793589435028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE production_issue_severity AS ENUM ('low', 'medium', 'high');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE production_issue_status AS ENUM ('open', 'resolved');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS production_issues (
        id SERIAL PRIMARY KEY,
        unit_id INT NOT NULL REFERENCES production_units(id) ON DELETE CASCADE,
        stage production_stage NOT NULL,
        description VARCHAR(2000) NOT NULL,
        severity production_issue_severity NOT NULL,
        status production_issue_status NOT NULL DEFAULT 'open',
        reported_by INT NOT NULL REFERENCES users(id),
        resolved_by INT REFERENCES users(id),
        resolved_at TIMESTAMPTZ,
        resolution TEXT,
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
      CREATE INDEX IF NOT EXISTS idx_production_issues_unit
        ON production_issues (unit_id, id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_production_issues_status
        ON production_issues (status, id)
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE production_unit_photos
          ADD CONSTRAINT fk_production_unit_photos_issue
          FOREIGN KEY (issue_id) REFERENCES production_issues(id);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE production_unit_photos
        DROP CONSTRAINT IF EXISTS fk_production_unit_photos_issue
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS production_issues`);
    await queryRunner.query(`DROP TYPE IF EXISTS production_issue_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS production_issue_severity`);
  }
}
