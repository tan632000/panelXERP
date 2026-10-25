import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Who last edited a version's price or terms (a pricing edit, or a refresh from the estimate).
 * Approval is four-eyes on content: neither the creator nor the last editor may approve or
 * reject. A new version starts with nobody, so a revision's approver is judged on its own edits.
 */
export class AddQuotationLastEditedBy1792918700425 implements MigrationInterface {
  name = 'AddQuotationLastEditedBy1792918700425';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales_quotation_versions
        ADD COLUMN IF NOT EXISTS last_edited_by INT REFERENCES users(id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales_quotation_versions DROP COLUMN IF EXISTS last_edited_by
    `);
  }
}
