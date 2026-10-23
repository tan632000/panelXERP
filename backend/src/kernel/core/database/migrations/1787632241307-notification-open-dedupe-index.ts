import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * At most one open notification per event type and subject.
 *
 * Restricted to open rows: once a record is resolved the same subject may raise a new one,
 * which is exactly what a daily scan does after yesterday's record was closed. Without the
 * index two concurrent scans that both find no open record would each insert one.
 */
export class NotificationOpenDedupeIndex1787632241307 implements MigrationInterface {
  name = 'NotificationOpenDedupeIndex1787632241307';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_open_dedupe
      ON notifications (event_type, dedupe_key)
      WHERE status = 'open' AND dedupe_key IS NOT NULL AND is_deleted = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_notifications_open_dedupe`,
    );
  }
}
