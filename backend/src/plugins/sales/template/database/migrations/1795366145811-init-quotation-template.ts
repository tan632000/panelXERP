import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quotation templates (TPL): reusable panel and part lists that carry no price. The code is
 * unique among live templates only (a deleted template frees it). Panels and lines are
 * children removed with their template, so they carry no soft-delete audit set; a line keeps
 * a hard foreign key to its item, which is what stops an item delete from orphaning it.
 */
export class InitQuotationTemplate1795366145811 implements MigrationInterface {
  name = 'InitQuotationTemplate1795366145811';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS quotation_templates (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_quotation_templates_code_active
        ON quotation_templates (LOWER(code))
        WHERE is_deleted = false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS quotation_template_panels (
        id SERIAL PRIMARY KEY,
        template_id INT NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
        tag VARCHAR(50) NOT NULL,
        description VARCHAR(500),
        quantity INT NOT NULL DEFAULT 1
          CONSTRAINT ck_quotation_template_panels_quantity CHECK (quantity >= 1)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_quotation_template_panels_tag
        ON quotation_template_panels (template_id, LOWER(tag))
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS quotation_template_lines (
        id SERIAL PRIMARY KEY,
        panel_id INT NOT NULL REFERENCES quotation_template_panels(id) ON DELETE CASCADE,
        item_id INT NOT NULL REFERENCES items(id),
        quantity NUMERIC(18,3) NOT NULL
          CONSTRAINT ck_quotation_template_lines_quantity CHECK (quantity > 0),
        group_label VARCHAR(255),
        note VARCHAR(500)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_quotation_template_lines_panel_id
        ON quotation_template_lines (panel_id)
    `);
    // The item delete check asks whether any line points at the item.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_quotation_template_lines_item_id
        ON quotation_template_lines (item_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS quotation_template_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS quotation_template_panels`);
    await queryRunner.query(`DROP TABLE IF EXISTS quotation_templates`);
  }
}
