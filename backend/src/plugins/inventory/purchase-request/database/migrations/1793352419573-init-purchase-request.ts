import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Purchase requests and their lines. No approval (user).
 *
 * - Never deleted (cancelled instead), so the code index counts every row.
 * - Nothing ordered is stored here: what a line has been ordered is derived from the purchase
 *   order lines that point at it (D-11), so cancelling, closing or returning against an order
 *   keeps the request right without a writer of its own.
 * - `source_order_id` carries no foreign key: sales orders are locked by their own writers
 *   (D-04).
 */
export class InitPurchaseRequest1793352419573 implements MigrationInterface {
  name = 'InitPurchaseRequest1793352419573';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS purchase_requests (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        note TEXT,
        is_cancelled BOOLEAN NOT NULL DEFAULT false,
        cancel_reason TEXT,
        cancelled_by INT REFERENCES users(id),
        cancelled_at TIMESTAMPTZ,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by INT REFERENCES users(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_requests_code
        ON purchase_requests (code)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS purchase_request_lines (
        id SERIAL PRIMARY KEY,
        request_id INT NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
        line_no INT NOT NULL,
        item_id INT NOT NULL REFERENCES items(id),
        quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
        needed_by DATE,
        note TEXT,
        source_order_id INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_purchase_request_lines_request
        ON purchase_request_lines (request_id, line_no)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_purchase_request_lines_source_order
        ON purchase_request_lines (source_order_id, item_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_pr_line
        ON purchase_order_lines (pr_line_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_source_order
        ON purchase_order_lines (source_order_id, item_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_purchase_order_lines_source_order`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_purchase_order_lines_pr_line`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_request_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_requests`);
  }
}
