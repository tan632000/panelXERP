import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stock counts, their lines and the log of every count saved.
 *
 * - Never deleted (cancelled instead), so the code index counts every row.
 * - At most one count is open: a partial unique index over a constant for the open statuses,
 *   which a concurrent second create fails on.
 * - A line keeps the book quantity read when it was last counted: the difference posted at
 *   approval is against that, so stock moving during the count is not counted twice.
 * - `submitter_ids` remembers everyone who ever submitted the count: none of them may approve
 *   it, also after a rejection and a resubmission by someone else.
 */
export class InitStocktake1793330588461 implements MigrationInterface {
  name = 'InitStocktake1793330588461';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE stocktake_status AS ENUM ('counting', 'submitted', 'approved', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE stocktake_scope AS ENUM ('all', 'location');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stocktakes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        scope stocktake_scope NOT NULL,
        location_id INT REFERENCES locations(id),
        status stocktake_status NOT NULL DEFAULT 'counting',
        note TEXT,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submitted_by INT REFERENCES users(id),
        submitted_at TIMESTAMPTZ,
        submitter_ids INT[] NOT NULL DEFAULT '{}',
        approved_by INT REFERENCES users(id),
        approved_at TIMESTAMPTZ,
        reject_reason TEXT,
        cancel_reason TEXT,
        cancelled_by INT REFERENCES users(id),
        cancelled_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_stocktakes_location CHECK ((scope = 'location') = (location_id IS NOT NULL))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stocktakes_code ON stocktakes (code)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stocktakes_open ON stocktakes ((true))
        WHERE status IN ('counting', 'submitted')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stocktake_lines (
        id SERIAL PRIMARY KEY,
        stocktake_id INT NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
        item_id INT NOT NULL REFERENCES items(id),
        counted_qty NUMERIC(18,3) CHECK (counted_qty >= 0),
        book_qty NUMERIC(18,3),
        counted_at TIMESTAMPTZ,
        unit_cost NUMERIC(18,4),
        value NUMERIC(18,2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stocktake_lines_item
        ON stocktake_lines (stocktake_id, item_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stocktake_lines_item ON stocktake_lines (item_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stocktake_count_log (
        id SERIAL PRIMARY KEY,
        line_id INT NOT NULL REFERENCES stocktake_lines(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id),
        counted_qty NUMERIC(18,3) NOT NULL,
        book_qty NUMERIC(18,3) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stocktake_count_log_line
        ON stocktake_count_log (line_id, id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stocktake_count_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS stocktake_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS stocktakes`);
    await queryRunner.query(`DROP TYPE IF EXISTS stocktake_scope`);
    await queryRunner.query(`DROP TYPE IF EXISTS stocktake_status`);
  }
}
