import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Goods receipts against purchase orders, and their lines.
 *
 * - Receipts are immutable and never deleted: a correction is a supplier return or a count.
 *   The code index therefore counts every row, like any document number.
 * - `request_key` makes a repeated post return the first receipt: its unique index is what a
 *   concurrent twin fails on (NULLs never collide).
 * - Unit cost is the purchase order line's price excluding VAT, whole VND; quantities have
 *   three decimals.
 */
export class InitStockReceipt1793262734519 implements MigrationInterface {
  name = 'InitStockReceipt1793262734519';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_receipts (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        purchase_order_id INT NOT NULL REFERENCES purchase_orders(id),
        note TEXT,
        request_key UUID,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_receipts_code
        ON stock_receipts (code)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_receipts_request_key
        ON stock_receipts (request_key)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_receipts_purchase_order
        ON stock_receipts (purchase_order_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_receipt_lines (
        id SERIAL PRIMARY KEY,
        receipt_id INT NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE,
        po_line_id INT NOT NULL REFERENCES purchase_order_lines(id),
        item_id INT NOT NULL REFERENCES items(id),
        quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
        unit_cost NUMERIC(18,0) NOT NULL CHECK (unit_cost >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_receipt_lines_receipt
        ON stock_receipt_lines (receipt_id, id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_receipt_lines_po_line
        ON stock_receipt_lines (po_line_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stock_receipt_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_receipts`);
  }
}
