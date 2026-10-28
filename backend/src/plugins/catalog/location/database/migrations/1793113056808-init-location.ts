import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Warehouse locations. The code is unique among active rows only: a soft-deleted location
 * frees its code, so the index is partial on `is_deleted = false`.
 */
export class InitLocation1793113056808 implements MigrationInterface {
  name = 'InitLocation1793113056808';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        code VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL,
        note TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_code_active
        ON locations (LOWER(code))
        WHERE is_deleted = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_locations_code_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS locations CASCADE`);
  }
}
