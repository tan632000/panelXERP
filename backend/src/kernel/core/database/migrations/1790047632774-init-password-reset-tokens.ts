import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backs the forgot-password flow (function list 1.3) and the reset step it hands off to (1.4).
 *
 * Only the SHA-256 of the emailed token is stored, so the unique index is on the hash. It is
 * partial on `is_deleted = false` because the table soft-deletes like every other: a revoked
 * row must not reserve its hash for good.
 */
export class InitPasswordResetTokens1790047632774 implements MigrationInterface {
  name = 'InitPasswordResetTokens1790047632774';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_tokens_token_hash
        ON password_reset_tokens (token_hash)
        WHERE is_deleted = false
    `);

    // Issuing a link revokes the user's outstanding ones, which reads by owner every time.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id
        ON password_reset_tokens (user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS ix_password_reset_tokens_user_id`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_password_reset_tokens_token_hash`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS password_reset_tokens`);
  }
}
