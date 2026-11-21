import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Photos of a QC round item. The object lives in storage under a generated key; rows are never
 * deleted. The per-round count limit is the service's to check under the cabinet lock.
 */
export class InitQcPhotos1794672583917 implements MigrationInterface {
  name = 'InitQcPhotos1794672583917';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS qc_photos (
        id SERIAL PRIMARY KEY,
        round_item_id INT NOT NULL REFERENCES qc_round_items(id),
        storage_key VARCHAR(255) NOT NULL,
        content_type VARCHAR(50) NOT NULL
          CHECK (content_type IN ('image/png', 'image/jpeg')),
        file_name VARCHAR(150) NOT NULL,
        size_bytes INT NOT NULL,
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
      CREATE INDEX IF NOT EXISTS idx_qc_photos_round_item
        ON qc_photos (round_item_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS qc_photos`);
  }
}
