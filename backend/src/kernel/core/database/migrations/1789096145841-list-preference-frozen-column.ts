import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-user frozen column of a list screen: the last column that stays pinned while the
 * table scrolls sideways, the way Excel freezes panes up to a chosen column.
 *
 * Additive on an existing table, so `down()` drops only the column `up()` added. NULL means
 * "nothing frozen", which is what every existing row starts as.
 */
export class ListPreferenceFrozenColumn1789096145841 implements MigrationInterface {
  name = 'ListPreferenceFrozenColumn1789096145841';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_list_preferences
      ADD COLUMN IF NOT EXISTS frozen_column VARCHAR(100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_list_preferences
      DROP COLUMN IF EXISTS frozen_column
    `);
  }
}
