import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a notification address named users instead of whole roles, and withhold itself from
 * named users when it does address a role.
 *
 * Purchase order and subcontract order notify the person who created the order, not everyone
 * holding their role — a purchase staff member must not be told that a colleague's order was
 * cancelled. Role addressing stays the default: an empty `user_ids` means "address the roles",
 * which is what every existing row is. `exclude_user_ids` covers the other half of the same
 * rule: a notice broadcast to the purchasing group must skip whoever just did the thing, who
 * already saw the toast.
 */
export class NotificationUserRecipients1789356339684 implements MigrationInterface {
  name = 'NotificationUserRecipients1789356339684';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS user_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS exclude_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    `);

    // The list query matches a caller's id against these arrays on every page, the same way
    // it matches role codes against `role_codes`.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_notifications_user_ids
        ON notifications USING GIN (user_ids)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_notifications_user_ids`);
    await queryRunner.query(`
      ALTER TABLE notifications
      DROP COLUMN IF EXISTS exclude_user_ids
    `);
    await queryRunner.query(`
      ALTER TABLE notifications
      DROP COLUMN IF EXISTS user_ids
    `);
  }
}
