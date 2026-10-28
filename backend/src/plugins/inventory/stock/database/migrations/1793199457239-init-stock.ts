import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The stock ledger of the single warehouse: one balance row per item, an append-only movement
 * log and the per-order reservations. The CHECK constraints are the ledger's invariants, so a
 * writer that miscounts fails in the database even when its own validation missed it.
 *
 * Order ids carry no foreign key on purpose: inserting a reservation or a movement would then
 * take a share lock on the order after the balance lock, inverting the lock order a sales
 * cancel takes.
 */
export class InitStock1793199457239 implements MigrationInterface {
  name = 'InitStock1793199457239';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE stock_movement_type AS ENUM (
          'receipt', 'issue', 'workshop_return', 'supplier_return', 'count_adjustment'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_balances (
        item_id INT PRIMARY KEY REFERENCES items(id),
        on_hand NUMERIC(18,3) NOT NULL DEFAULT 0,
        reserved NUMERIC(18,3) NOT NULL DEFAULT 0,
        value NUMERIC(18,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_stock_balances_on_hand CHECK (on_hand >= 0),
        CONSTRAINT ck_stock_balances_reserved CHECK (reserved >= 0),
        CONSTRAINT ck_stock_balances_reserved_on_hand CHECK (reserved <= on_hand),
        CONSTRAINT ck_stock_balances_value CHECK (value >= 0),
        CONSTRAINT ck_stock_balances_empty_value CHECK (on_hand > 0 OR value = 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id BIGSERIAL PRIMARY KEY,
        item_id INT NOT NULL REFERENCES items(id),
        movement_type stock_movement_type NOT NULL,
        quantity NUMERIC(18,3) NOT NULL,
        unit_cost NUMERIC(18,4) NOT NULL,
        value NUMERIC(18,2) NOT NULL,
        reference_value NUMERIC(18,2),
        on_hand_after NUMERIC(18,3) NOT NULL,
        avg_cost_after NUMERIC(18,4) NOT NULL,
        document_type VARCHAR(32) NOT NULL,
        document_id INT NOT NULL,
        document_line_id INT,
        order_id INT,
        order_line_id INT,
        reason TEXT,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_stock_movements_quantity CHECK (quantity <> 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_movements_item
        ON stock_movements (item_id, id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_movements_document
        ON stock_movements (document_type, document_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_reservations (
        id SERIAL PRIMARY KEY,
        order_id INT NOT NULL,
        item_id INT NOT NULL REFERENCES items(id),
        quantity NUMERIC(18,3) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_stock_reservations_order_item UNIQUE (order_id, item_id),
        CONSTRAINT ck_stock_reservations_quantity CHECK (quantity > 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_reservations_item
        ON stock_reservations (item_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stock_reservations`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_movements`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_balances`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_movement_type`);
  }
}
