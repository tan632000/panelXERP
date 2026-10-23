import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kernel in-app notifications: role-addressed records plus per-recipient read markers.
 *
 * A record is addressed to role codes rather than user ids, so recipients are resolved at
 * read time. `status` is shared; read state is one row per user and notification.
 */
export class InitNotifications1786959791072 implements MigrationInterface {
  name = 'InitNotifications1786959791072';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(64) NOT NULL,
        dedupe_key VARCHAR(128),
        role_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
        required_scope VARCHAR(64),
        message TEXT,
        link VARCHAR(500),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(32) NOT NULL DEFAULT 'open'
          CHECK (status IN ('open','resolved')),
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
      CREATE INDEX IF NOT EXISTS idx_notifications_event_type_created_at
        ON notifications (event_type, created_at DESC)
        WHERE is_deleted = false
    `);

    // At most one open record per subject, so a repeated emit cannot stack duplicates.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_open_subject
        ON notifications (event_type, dedupe_key)
        WHERE dedupe_key IS NOT NULL
          AND status = 'open'
          AND is_deleted = false
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_role_codes
        ON notifications USING GIN (role_codes)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_reads (
        id SERIAL PRIMARY KEY,
        notification_id INT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_reads_pair
        ON notification_reads (notification_id, user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notification_reads CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications CASCADE`);
  }
}
