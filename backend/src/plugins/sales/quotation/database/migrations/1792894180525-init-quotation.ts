import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quotations (`NN-ddmmyyyy/BG`): one header per request, numbered versions, one line per
 * estimate panel with a frozen copy of that panel's BOM and cost-line names.
 *
 * The code is a document number, so its unique index counts deleted rows too (no `is_deleted`
 * filter); the creator retries the transaction that loses a race on it. Versions are children
 * removed only with their header, so they carry no soft-delete audit set. Two indexes keep
 * the version chain sound under concurrent writers: `(quotation_id, ver)` is unique, and at
 * most one version per quotation is not `closed`, which a second revise would otherwise break.
 */
export class InitQuotation1792894180525 implements MigrationInterface {
  name = 'InitQuotation1792894180525';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_quotations (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        request_id INT NOT NULL REFERENCES sales_requests(id),
        estimate_id INT NOT NULL REFERENCES sales_estimates(id),
        latest_ver INT NOT NULL DEFAULT 1,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_quotations_code
        ON sales_quotations (code)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_quotations_request_id
        ON sales_quotations (request_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_quotation_versions (
        id SERIAL PRIMARY KEY,
        quotation_id INT NOT NULL REFERENCES sales_quotations(id) ON DELETE CASCADE,
        ver INT NOT NULL CONSTRAINT ck_sales_quotation_versions_ver CHECK (ver >= 1),
        status VARCHAR(20) NOT NULL DEFAULT 'draft'
          CONSTRAINT ck_sales_quotation_versions_status CHECK (
            status IN (
              'draft', 'pending_approval', 'approved', 'rejected',
              'customer_confirmed', 'cancelled', 'closed'
            )
          ),
        estimate_revision_id INT NOT NULL REFERENCES sales_estimate_revisions(id),
        estimate_revision INT NOT NULL,
        discount_type VARCHAR(10) NOT NULL DEFAULT 'percent'
          CONSTRAINT ck_sales_quotation_versions_discount_type CHECK (
            discount_type IN ('percent', 'amount')
          ),
        discount_value NUMERIC(18,2) NOT NULL DEFAULT 0
          CONSTRAINT ck_sales_quotation_versions_discount_value CHECK (discount_value >= 0),
        vat_rate NUMERIC(5,2) NOT NULL DEFAULT 8
          CONSTRAINT ck_sales_quotation_versions_vat_rate CHECK (vat_rate IN (0, 5, 8, 10)),
        subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
        discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        taxable NUMERIC(18,2) NOT NULL DEFAULT 0,
        vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        total NUMERIC(18,2) NOT NULL DEFAULT 0,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_quotation_versions_number
        ON sales_quotation_versions (quotation_id, ver)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_quotation_versions_one_open
        ON sales_quotation_versions (quotation_id)
        WHERE status <> 'closed'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_quotation_lines (
        id SERIAL PRIMARY KEY,
        version_id INT NOT NULL REFERENCES sales_quotation_versions(id) ON DELETE CASCADE,
        tag VARCHAR(50) NOT NULL,
        description VARCHAR(500),
        quantity INT NOT NULL DEFAULT 1
          CONSTRAINT ck_sales_quotation_lines_quantity CHECK (quantity >= 1),
        unit_cost NUMERIC(18,2) NOT NULL
          CONSTRAINT ck_sales_quotation_lines_unit_cost CHECK (unit_cost >= 0),
        margin_percent NUMERIC(6,2) NOT NULL DEFAULT 0
          CONSTRAINT ck_sales_quotation_lines_margin CHECK (
            margin_percent >= 0 AND margin_percent <= 1000
          ),
        unit_price NUMERIC(18,2) NOT NULL DEFAULT 0,
        amount NUMERIC(18,2) NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_quotation_lines_version_id
        ON sales_quotation_lines (version_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_quotation_bom_lines (
        id SERIAL PRIMARY KEY,
        line_id INT NOT NULL REFERENCES sales_quotation_lines(id) ON DELETE CASCADE,
        item_code VARCHAR(64) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        item_brand VARCHAR(255),
        item_unit VARCHAR(20) NOT NULL,
        quantity NUMERIC(18,3) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_quotation_bom_lines_line_id
        ON sales_quotation_bom_lines (line_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_quotation_cost_lines (
        id SERIAL PRIMARY KEY,
        line_id INT NOT NULL REFERENCES sales_quotation_lines(id) ON DELETE CASCADE,
        category VARCHAR(20) NOT NULL,
        description VARCHAR(500)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_quotation_cost_lines_line_id
        ON sales_quotation_cost_lines (line_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sales_quotation_cost_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_quotation_bom_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_quotation_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_quotation_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_quotations CASCADE`);
  }
}
