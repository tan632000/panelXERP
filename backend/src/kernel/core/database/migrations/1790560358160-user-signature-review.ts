import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the review step for a signature a non-administrator submits.
 *
 * The submitted image waits in `pending_signature_url` until an administrator approves it, and
 * only then replaces `signature_url` — the one printed documents stamp. A rejection keeps its
 * reason on the account, so the holder sees why on their profile.
 */
export class UserSignatureReview1790560358160 implements MigrationInterface {
  name = 'UserSignatureReview1790560358160';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN pending_signature_url VARCHAR(500),
        ADD COLUMN signature_requested_at TIMESTAMPTZ,
        ADD COLUMN signature_rejection_reason VARCHAR(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN signature_rejection_reason,
        DROP COLUMN signature_requested_at,
        DROP COLUMN pending_signature_url
    `);
  }
}
