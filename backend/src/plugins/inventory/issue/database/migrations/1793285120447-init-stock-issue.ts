import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Materials issued to orders and returned by the workshop, with their lines.
 *
 * - Both documents are immutable and never deleted, so their code indexes count every row.
 * - `order_id` and `order_line_id` carry no foreign key: the order is locked `FOR SHARE` by
 *   the document, and a key share taken from here after the balance locks would stand against
 *   the global lock order (lesson of P1 task-11).
 * - `request_key` makes a repeated post return the first document: its unique index is what a
 *   concurrent twin fails on (NULLs never collide).
 * - `unit_cost` and `value` are what the stock movement booked: the average at the issue, the
 *   order's net issued average at the return; `value` is signed like the movement.
 */
export class InitStockIssue1793285120447 implements MigrationInterface {
  name = 'InitStockIssue1793285120447';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['stock_issues', 'stock_workshop_returns']) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          code VARCHAR(30) NOT NULL,
          order_id INT NOT NULL,
          note TEXT,
          request_key UUID,
          created_by INT REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_code ON ${table} (code)
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_request_key ON ${table} (request_key)
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_${table}_order ON ${table} (order_id)
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_issue_lines (
        id SERIAL PRIMARY KEY,
        issue_id INT NOT NULL REFERENCES stock_issues(id) ON DELETE CASCADE,
        item_id INT NOT NULL REFERENCES items(id),
        order_line_id INT,
        quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
        unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
        value NUMERIC(18,2) NOT NULL DEFAULT 0,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_issue_lines_issue
        ON stock_issue_lines (issue_id, id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_workshop_return_lines (
        id SERIAL PRIMARY KEY,
        return_id INT NOT NULL REFERENCES stock_workshop_returns(id) ON DELETE CASCADE,
        item_id INT NOT NULL REFERENCES items(id),
        order_line_id INT,
        quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
        unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
        value NUMERIC(18,2) NOT NULL DEFAULT 0,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_workshop_return_lines_return
        ON stock_workshop_return_lines (return_id, id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stock_workshop_return_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_issue_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_workshop_returns`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_issues`);
  }
}
