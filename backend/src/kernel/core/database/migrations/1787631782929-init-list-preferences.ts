import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-user column visibility of a list screen.
 *
 * Additive: no existing table is touched, so `down()` drops exactly what `up()` created.
 * The foreign key cascades, so no preference row can outlive the account that made it.
 */
export class InitListPreferences1787631782929 implements MigrationInterface {
  name = 'InitListPreferences1787631782929';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_list_preferences (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_key VARCHAR(100) NOT NULL,
        visible_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_list_preferences_user_module UNIQUE (user_id, module_key)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS user_list_preferences CASCADE`,
    );
  }
}
