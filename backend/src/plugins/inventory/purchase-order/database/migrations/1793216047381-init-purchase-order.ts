import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Purchase orders, their lines and their history.
 *
 * - The code is a document number: its unique index counts deleted rows, so an issued number
 *   is never reused (creates retry a lost race).
 * - `pr_line_id` and `source_order_id` carry no foreign key: purchase requests and sales
 *   orders are locked by their own writers, and a key share on them from here would stand in
 *   the global lock order.
 * - Money is whole VND (`numeric(18,0)`); quantities have three decimals.
 */
export class InitPurchaseOrder1793216047381 implements MigrationInterface {
  name = 'InitPurchaseOrder1793216047381';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE purchase_order_status AS ENUM (
          'draft', 'pending_approval', 'approved', 'partially_received',
          'received', 'closed', 'cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE purchase_order_event_type AS ENUM (
          'submitted', 'approved', 'rejected', 'cancelled', 'closed'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        supplier_id INT NOT NULL REFERENCES suppliers(id),
        expected_date DATE,
        vat_rate SMALLINT NOT NULL CHECK (vat_rate IN (0, 5, 8, 10)),
        subtotal NUMERIC(18,0) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
        vat_amount NUMERIC(18,0) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
        total NUMERIC(18,0) NOT NULL DEFAULT 0 CHECK (total >= 0),
        note TEXT,
        status purchase_order_status NOT NULL DEFAULT 'draft',
        editor_ids INT[] NOT NULL DEFAULT '{}',
        submitted_by INT REFERENCES users(id),
        submitted_at TIMESTAMPTZ,
        approved_by INT REFERENCES users(id),
        approved_at TIMESTAMPTZ,
        cancel_reason TEXT,
        cancelled_by INT REFERENCES users(id),
        cancelled_at TIMESTAMPTZ,
        close_reason TEXT,
        closed_by INT REFERENCES users(id),
        closed_at TIMESTAMPTZ,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_code
        ON purchase_orders (code)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier
        ON purchase_orders (supplier_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
        ON purchase_orders (status)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_lines (
        id SERIAL PRIMARY KEY,
        purchase_order_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        line_no INT NOT NULL,
        item_id INT NOT NULL REFERENCES items(id),
        item_code VARCHAR(64) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        item_unit VARCHAR(20) NOT NULL,
        quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(18,0) NOT NULL CHECK (unit_price >= 0),
        amount NUMERIC(18,0) NOT NULL CHECK (amount >= 0),
        received_qty NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
        pr_line_id INT,
        source_order_id INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_order
        ON purchase_order_lines (purchase_order_id, line_no)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_item
        ON purchase_order_lines (item_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_events (
        id SERIAL PRIMARY KEY,
        purchase_order_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        event purchase_order_event_type NOT NULL,
        actor_id INT NOT NULL REFERENCES users(id),
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_purchase_order_events_order
        ON purchase_order_events (purchase_order_id, id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_order_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_order_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_orders`);
    await queryRunner.query(`DROP TYPE IF EXISTS purchase_order_event_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS purchase_order_status`);
  }
}
