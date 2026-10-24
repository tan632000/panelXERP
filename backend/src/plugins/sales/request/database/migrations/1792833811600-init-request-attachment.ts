import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drawings and specs of a request. The row points at the stored object by key; the request
 * is soft-deleted, never removed, so the foreign key never cascades a file away.
 *
 * Attachments are hard-deleted (the stored object goes with the row and the removal is kept on
 * the request's timeline), so the table has no soft-delete audit set, like the kernel's
 * `notification_reads` and `user_sessions`.
 */
export class InitRequestAttachment1792833811600 implements MigrationInterface {
  name = 'InitRequestAttachment1792833811600';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_request_attachments (
        id SERIAL PRIMARY KEY,
        request_id INT NOT NULL REFERENCES sales_requests(id),
        storage_key VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        content_type VARCHAR(100) NOT NULL,
        size_bytes INT NOT NULL,
        uploaded_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_request_attachments_request_id
        ON sales_request_attachments (request_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS ix_sales_request_attachments_request_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS sales_request_attachments`);
  }
}
