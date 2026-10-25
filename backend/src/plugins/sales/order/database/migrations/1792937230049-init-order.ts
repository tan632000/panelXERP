import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sales orders (`DH_YYYY_NNNN`): one per customer-confirmed quotation, with copies of the
 * customer, project, payment terms, panel lines (and their BOM) and totals taken at conversion.
 *
 * Orders are never deleted, only cancelled, so both unique indexes count every row (no
 * `is_deleted` filter): the code is a document number, and `quotation_id` keeps a cancelled
 * order blocking a second conversion of the same quotation. The creator retries the
 * transaction that loses a race on the code.
 */
export class InitOrder1792937230049 implements MigrationInterface {
  name = 'InitOrder1792937230049';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        quotation_id INT NOT NULL REFERENCES sales_quotations(id),
        quotation_version_id INT NOT NULL REFERENCES sales_quotation_versions(id),
        quotation_ver INT NOT NULL,
        request_id INT NOT NULL REFERENCES sales_requests(id),
        estimate_id INT NOT NULL REFERENCES sales_estimates(id),
        estimate_revision_id INT NOT NULL REFERENCES sales_estimate_revisions(id),
        estimate_revision INT NOT NULL,
        customer_id INT NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_tax_code VARCHAR(50),
        customer_address TEXT,
        project_id INT,
        project_name VARCHAR(255),
        contract_no VARCHAR(100),
        contract_date DATE,
        delivery_date DATE,
        terms JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'open'
          CONSTRAINT ck_sales_orders_status CHECK (
            status IN ('open', 'in_production', 'delivered', 'completed', 'cancelled')
          ),
        cancel_reason VARCHAR(1000),
        cancelled_by INT REFERENCES users(id),
        cancelled_at TIMESTAMPTZ,
        subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
        discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        taxable NUMERIC(18,2) NOT NULL DEFAULT 0,
        vat_rate NUMERIC(5,2) NOT NULL DEFAULT 8,
        vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        total NUMERIC(18,2) NOT NULL DEFAULT 0,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_code
        ON sales_orders (code)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_quotation_id
        ON sales_orders (quotation_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_orders_request_id
        ON sales_orders (request_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_orders_customer_id
        ON sales_orders (customer_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_order_lines (
        id SERIAL PRIMARY KEY,
        order_id INT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
        tag VARCHAR(50) NOT NULL,
        description VARCHAR(500),
        quantity INT NOT NULL DEFAULT 1,
        unit_price NUMERIC(18,2) NOT NULL,
        amount NUMERIC(18,2) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_order_lines_order_id
        ON sales_order_lines (order_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_order_bom_lines (
        id SERIAL PRIMARY KEY,
        line_id INT NOT NULL REFERENCES sales_order_lines(id) ON DELETE CASCADE,
        item_code VARCHAR(64) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        item_brand VARCHAR(255),
        item_unit VARCHAR(20) NOT NULL,
        quantity NUMERIC(18,3) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_order_bom_lines_line_id
        ON sales_order_bom_lines (line_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sales_order_bom_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_order_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_orders CASCADE`);
  }
}
