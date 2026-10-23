import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens the notification link to hold a batch target.
 *
 * A batch notification opens the list filtered to the ids it names, and a batch may carry up to
 * a hundred of them — more than the original 500 characters fit.
 */
export class NotificationLinkLength1790129186501 implements MigrationInterface {
  name = 'NotificationLinkLength1790129186501';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE notifications ALTER COLUMN link TYPE VARCHAR(2048)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE notifications ALTER COLUMN link TYPE VARCHAR(500) USING LEFT(link, 500)`,
    );
  }
}
