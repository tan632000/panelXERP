import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estimates (DT): one per request, with numbered revisions, each holding panels with BOM
 * lines and cost lines. The code is a document number, so its unique index counts deleted
 * rows too (no `is_deleted` filter); the creator retries the insert that loses a race on it.
 *
 * The revision, panel and line tables are children that are removed only with their parent
 * (or, for a draft, line by line), so they carry no soft-delete audit set. Two partial unique
 * indexes keep an estimate to at most one draft and one current submitted revision, which is
 * what a concurrent revise or submit would otherwise break.
 */
export class InitEstimate1792856909735 implements MigrationInterface {
  name = 'InitEstimate1792856909735';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_estimates (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        request_id INT NOT NULL REFERENCES sales_requests(id),
        status VARCHAR(20) NOT NULL DEFAULT 'draft'
          CONSTRAINT ck_sales_estimates_status CHECK (status IN ('draft', 'submitted')),
        latest_revision INT NOT NULL DEFAULT 1,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_estimates_code
        ON sales_estimates (code)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_estimates_request_id
        ON sales_estimates (request_id)
        WHERE is_deleted = false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_estimate_revisions (
        id SERIAL PRIMARY KEY,
        estimate_id INT NOT NULL REFERENCES sales_estimates(id) ON DELETE CASCADE,
        revision INT NOT NULL CONSTRAINT ck_sales_estimate_revisions_revision CHECK (revision >= 1),
        status VARCHAR(20) NOT NULL DEFAULT 'draft'
          CONSTRAINT ck_sales_estimate_revisions_status CHECK (
            status IN ('draft', 'submitted', 'superseded')
          ),
        total NUMERIC(18,2) NOT NULL DEFAULT 0,
        submitted_at TIMESTAMPTZ,
        submitted_by INT REFERENCES users(id),
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_estimate_revisions_number
        ON sales_estimate_revisions (estimate_id, revision)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_estimate_revisions_one_draft
        ON sales_estimate_revisions (estimate_id)
        WHERE status = 'draft'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_estimate_revisions_one_submitted
        ON sales_estimate_revisions (estimate_id)
        WHERE status = 'submitted'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_estimate_panels (
        id SERIAL PRIMARY KEY,
        revision_id INT NOT NULL REFERENCES sales_estimate_revisions(id) ON DELETE CASCADE,
        tag VARCHAR(50) NOT NULL,
        description VARCHAR(500),
        quantity INT NOT NULL DEFAULT 1
          CONSTRAINT ck_sales_estimate_panels_quantity CHECK (quantity >= 1),
        unit_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
        total NUMERIC(18,2) NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_estimate_panels_tag
        ON sales_estimate_panels (revision_id, lower(tag))
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_estimate_bom_lines (
        id SERIAL PRIMARY KEY,
        panel_id INT NOT NULL REFERENCES sales_estimate_panels(id) ON DELETE CASCADE,
        item_id INT NOT NULL REFERENCES items(id),
        item_code VARCHAR(64) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        item_brand VARCHAR(255),
        item_unit VARCHAR(20) NOT NULL,
        quantity NUMERIC(18,3) NOT NULL
          CONSTRAINT ck_sales_estimate_bom_lines_quantity CHECK (quantity > 0),
        unit_cost NUMERIC(18,2) NOT NULL
          CONSTRAINT ck_sales_estimate_bom_lines_unit_cost CHECK (unit_cost >= 0),
        amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        note VARCHAR(500)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_estimate_bom_lines_panel_id
        ON sales_estimate_bom_lines (panel_id)
    `);
    // The item delete check asks whether any line points at the item.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_estimate_bom_lines_item_id
        ON sales_estimate_bom_lines (item_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_estimate_cost_lines (
        id SERIAL PRIMARY KEY,
        panel_id INT NOT NULL REFERENCES sales_estimate_panels(id) ON DELETE CASCADE,
        category VARCHAR(20) NOT NULL
          CONSTRAINT ck_sales_estimate_cost_lines_category CHECK (
            category IN ('design', 'labor', 'installation', 'transport', 'other')
          ),
        description VARCHAR(500),
        amount NUMERIC(18,2) NOT NULL
          CONSTRAINT ck_sales_estimate_cost_lines_amount CHECK (amount >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_estimate_cost_lines_panel_id
        ON sales_estimate_cost_lines (panel_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sales_estimate_cost_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_estimate_bom_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_estimate_panels`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_estimate_revisions`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_estimates CASCADE`);
  }
}
