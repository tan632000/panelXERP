import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the account's electronic signature.
 *
 * Like the avatar, the column holds the storage key of a transparent PNG rather than a URL, so
 * printed documents can load the image and the session can re-sign a link on every read.
 */
export class UserSignature1790317893209 implements MigrationInterface {
  name = 'UserSignature1790317893209';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN signature_url VARCHAR(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN signature_url`);
  }
}
