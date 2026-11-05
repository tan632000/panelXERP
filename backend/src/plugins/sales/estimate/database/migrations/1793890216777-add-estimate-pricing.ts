import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The pricing step of an estimate: engineers submit quantities, sales fills the costs and marks
 * the submitted revision priced. `priced_at` is null until then, and a quotation is built only on
 * a priced revision.
 *
 * Revisions that were submitted before the step existed carried their costs from the engineer,
 * so they count as priced by their submitter at the time they were submitted. A draft stays
 * unpriced.
 */
export class AddEstimatePricing1793890216777 implements MigrationInterface {
  name = 'AddEstimatePricing1793890216777';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales_estimate_revisions
        ADD COLUMN IF NOT EXISTS priced_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS priced_by INT REFERENCES users(id)
    `);
    await queryRunner.query(`
      UPDATE sales_estimate_revisions
         SET priced_at = submitted_at, priced_by = submitted_by
       WHERE status IN ('submitted', 'superseded') AND priced_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales_estimate_revisions
        DROP COLUMN IF EXISTS priced_by,
        DROP COLUMN IF EXISTS priced_at
    `);
  }
}
