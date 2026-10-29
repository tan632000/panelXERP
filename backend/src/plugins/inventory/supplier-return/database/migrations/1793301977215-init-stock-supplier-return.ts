import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Goods returned to the supplier against the purchase order line they came on.
 *
 * - Immutable and never deleted, so the code index counts every row.
 * - `request_key` makes a repeated post return the first document: its unique index is what a
 *   concurrent twin fails on (NULLs never collide).
 * - `unit_cost` is the purchase order line's price excluding VAT; `reference_value` is what the
 *   returned goods were worth on the order (`round(q × price)`) and `value` the real, signed
 *   change of the stock value, which differs from it when the stock was worth less or the last
 *   unit leaves — the difference is the supplier-payable reconciliation's to explain.
 */
export class InitStockSupplierReturn1793301977215 implements MigrationInterface {
  name = 'InitStockSupplierReturn1793301977215';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_supplier_returns (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        purchase_order_id INT NOT NULL REFERENCES purchase_orders(id),
        reason TEXT NOT NULL,
        request_key UUID,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_supplier_returns_code
        ON stock_supplier_returns (code)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_supplier_returns_request_key
        ON stock_supplier_returns (request_key)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_supplier_returns_purchase_order
        ON stock_supplier_returns (purchase_order_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_supplier_return_lines (
        id SERIAL PRIMARY KEY,
        return_id INT NOT NULL REFERENCES stock_supplier_returns(id) ON DELETE CASCADE,
        po_line_id INT NOT NULL REFERENCES purchase_order_lines(id),
        item_id INT NOT NULL REFERENCES items(id),
        quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
        unit_cost NUMERIC(18,0) NOT NULL CHECK (unit_cost >= 0),
        value NUMERIC(18,2) NOT NULL DEFAULT 0,
        reference_value NUMERIC(18,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_supplier_return_lines_return
        ON stock_supplier_return_lines (return_id, id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_supplier_return_lines_po_line
        ON stock_supplier_return_lines (po_line_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stock_supplier_return_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_supplier_returns`);
  }
}
