import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-user column widths of a list screen: the widths the account dragged its columns to,
 * keyed by column key, so a list comes back at the same layout after a reload or sign-in.
 *
 * Additive on an existing table, so `down()` drops only the column `up()` added. An empty
 * object means "declared widths", which is what every existing row starts as.
 */
export class ListPreferenceColumnWidths1792136248820 implements MigrationInterface {
  name = 'ListPreferenceColumnWidths1792136248820';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_list_preferences
      ADD COLUMN IF NOT EXISTS column_widths JSONB NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_list_preferences
      DROP COLUMN IF EXISTS column_widths
    `);
  }
}
