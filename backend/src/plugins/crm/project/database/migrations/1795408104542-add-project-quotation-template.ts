import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The quotation template a project's estimates start from. Deliberately no foreign key: the CRM
 * plugin stays decoupled from sales, and the template delete check guards the reference instead.
 * Existing projects keep null.
 */
export class AddProjectQuotationTemplate1795408104542 implements MigrationInterface {
  name = 'AddProjectQuotationTemplate1795408104542';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS quotation_template_id INT NULL`,
    );
    // The template delete check asks whether any live project names the template.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_projects_quotation_template_id ON projects (quotation_template_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS ix_projects_quotation_template_id`,
    );
    await queryRunner.query(
      `ALTER TABLE projects DROP COLUMN IF EXISTS quotation_template_id`,
    );
  }
}
