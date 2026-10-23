import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One row per signed-in device, replacing the single `users.refresh_token` slot: with one
 * slot, signing in on a second machine invalidated the first one's refresh token, so every
 * user of a shared account kept being sent back to the login screen.
 *
 * `users.refresh_token` stays for now: a token issued before this release is still honoured
 * once and moved into a session row, so deploying does not sign everybody out.
 */
export class InitUserSessions1790245411443 implements MigrationInterface {
  name = 'InitUserSessions1790245411443';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sessions_token_hash
        ON user_sessions (token_hash)
        WHERE is_deleted = false
    `);

    // Sign-in counts an account's live sessions and revocation sweeps them, both by owner.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_user_sessions_user_id
        ON user_sessions (user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_user_sessions_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_user_sessions_token_hash`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_sessions`);
  }
}
