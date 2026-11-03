import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Who started and finished each stage, and the history entries stage work writes. The new
 * event values are only added here, never used, so the migration's own transaction may add them.
 */
export class AddStageTracking1793430128377 implements MigrationInterface {
  name = 'AddStageTracking1793430128377';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE production_unit_stages
        ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS started_by INT REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS done_by INT REFERENCES users(id)
    `);
    for (const value of [
      'stage_started',
      'stage_finished',
      'stage_undone',
      'completed',
    ]) {
      await queryRunner.query(
        `ALTER TYPE production_order_event_type ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Enum values cannot be dropped; the unused values are harmless.
    await queryRunner.query(`
      ALTER TABLE production_unit_stages
        DROP COLUMN IF EXISTS done_by,
        DROP COLUMN IF EXISTS done_at,
        DROP COLUMN IF EXISTS started_by,
        DROP COLUMN IF EXISTS started_at
    `);
  }
}
