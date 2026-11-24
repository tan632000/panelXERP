import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What an AI run leaves on an estimate: panels and BOM lines carry the AI columns (`is_verified`
 * is the engineer's check of one line), and `sales_estimate_ai_runs` records each run. The
 * partial unique index keeps a request to one queued or running run, which is what two
 * concurrent triggers would otherwise break.
 */
export class AddEstimateAiFields1795364024211 implements MigrationInterface {
  name = 'AddEstimateAiFields1795364024211';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales_estimate_panels
        ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS ai_note VARCHAR(1000)
    `);
    await queryRunner.query(`
      ALTER TABLE sales_estimate_bom_lines
        ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(3,2)
          CONSTRAINT ck_sales_estimate_bom_lines_ai_confidence
          CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
        ADD COLUMN IF NOT EXISTS ai_note VARCHAR(1000),
        ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_estimate_ai_runs (
        id SERIAL PRIMARY KEY,
        request_id INT NOT NULL REFERENCES sales_requests(id),
        status VARCHAR(20) NOT NULL DEFAULT 'queued'
          CONSTRAINT ck_sales_estimate_ai_runs_status CHECK (
            status IN ('queued', 'running', 'succeeded', 'failed')
          ),
        error VARCHAR(200),
        estimate_id INT REFERENCES sales_estimates(id),
        summary TEXT,
        created_by INT NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_estimate_ai_runs_active
        ON sales_estimate_ai_runs (request_id)
        WHERE status IN ('queued', 'running')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_sales_estimate_ai_runs_active`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS sales_estimate_ai_runs`);
    await queryRunner.query(`
      ALTER TABLE sales_estimate_bom_lines
        DROP COLUMN IF EXISTS is_verified,
        DROP COLUMN IF EXISTS ai_note,
        DROP COLUMN IF EXISTS ai_confidence,
        DROP COLUMN IF EXISTS is_ai_generated
    `);
    await queryRunner.query(`
      ALTER TABLE sales_estimate_panels
        DROP COLUMN IF EXISTS ai_note,
        DROP COLUMN IF EXISTS is_ai_generated
    `);
  }
}
