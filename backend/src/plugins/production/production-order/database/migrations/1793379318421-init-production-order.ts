import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Production orders, their cabinets, the six stage rows of each cabinet and the history.
 *
 * - The code is a document number: its unique index counts deleted rows, so an issued number
 *   is never reused (creates retry a lost race).
 * - `order_id` and `order_line_id` carry no foreign key: the sales order is locked by its own
 *   writers through the sales port, and a key share on it from here would stand in the global
 *   lock order.
 * - One non-cancelled production order per sales order, enforced by a partial unique index.
 */
export class InitProductionOrder1793379318421 implements MigrationInterface {
  name = 'InitProductionOrder1793379318421';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE production_order_status AS ENUM (
          'draft', 'released', 'completed', 'cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE production_stage AS ENUM (
          'material_prep', 'enclosure', 'device_mounting', 'wiring',
          'internal_test', 'finishing'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE production_stage_status AS ENUM (
          'pending', 'in_progress', 'done'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE production_order_event_type AS ENUM (
          'created', 'released', 'cancelled', 'unit_updated'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS production_orders (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        order_id INT NOT NULL,
        order_code VARCHAR(30) NOT NULL,
        status production_order_status NOT NULL DEFAULT 'draft',
        released_at TIMESTAMPTZ,
        released_by INT REFERENCES users(id),
        cancel_reason TEXT,
        cancelled_at TIMESTAMPTZ,
        cancelled_by INT REFERENCES users(id),
        completed_at TIMESTAMPTZ,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_production_orders_code
        ON production_orders (code)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_production_orders_order_live
        ON production_orders (order_id)
        WHERE status <> 'cancelled' AND is_deleted = false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_production_orders_status
        ON production_orders (status)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS production_units (
        id SERIAL PRIMARY KEY,
        production_order_id INT NOT NULL REFERENCES production_orders(id),
        order_line_id INT NOT NULL,
        code VARCHAR(60) NOT NULL,
        tag VARCHAR(50) NOT NULL,
        description VARCHAR(500),
        assignee_id INT REFERENCES users(id),
        planned_end_date DATE,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_production_units_order_code
        ON production_units (production_order_id, code)
        WHERE is_deleted = false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_production_units_assignee
        ON production_units (assignee_id)
        WHERE assignee_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS production_unit_stages (
        id SERIAL PRIMARY KEY,
        unit_id INT NOT NULL REFERENCES production_units(id) ON DELETE CASCADE,
        stage production_stage NOT NULL,
        seq SMALLINT NOT NULL CHECK (seq BETWEEN 1 AND 6),
        status production_stage_status NOT NULL DEFAULT 'pending'
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_production_unit_stages_unit_stage
        ON production_unit_stages (unit_id, stage)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS production_order_events (
        id SERIAL PRIMARY KEY,
        production_order_id INT NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
        event production_order_event_type NOT NULL,
        actor_id INT NOT NULL REFERENCES users(id),
        unit_code VARCHAR(60),
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_production_order_events_order
        ON production_order_events (production_order_id, id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS production_order_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS production_unit_stages`);
    await queryRunner.query(`DROP TABLE IF EXISTS production_units`);
    await queryRunner.query(`DROP TABLE IF EXISTS production_orders`);
    await queryRunner.query(`DROP TYPE IF EXISTS production_order_event_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS production_stage_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS production_stage`);
    await queryRunner.query(`DROP TYPE IF EXISTS production_order_status`);
  }
}
