import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Photos of a cabinet, per stage. The object key never leaves the server. `issue_id` carries
 * no key here: the production issue feature adds it, so photos work without that feature.
 */
export class AddUnitPhotos1793589420917 implements MigrationInterface {
  name = 'AddUnitPhotos1793589420917';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS production_unit_photos (
        id SERIAL PRIMARY KEY,
        unit_id INT NOT NULL REFERENCES production_units(id) ON DELETE CASCADE,
        stage production_stage NOT NULL,
        issue_id INT,
        storage_key VARCHAR(255) NOT NULL,
        file_name VARCHAR(150) NOT NULL,
        content_type VARCHAR(50) NOT NULL,
        size_bytes INT NOT NULL,
        uploaded_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_production_unit_photos_unit
        ON production_unit_photos (unit_id, stage, id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS production_unit_photos`);
  }
}
