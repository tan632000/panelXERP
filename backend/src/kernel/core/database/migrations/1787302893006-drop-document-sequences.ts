import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops `document_sequences`. Every code — master data and sales documents alike — is
 * now derived from the records themselves, so the counter table is a second source of
 * truth nobody reads.
 */
export class DropDocumentSequences1787302893006 implements MigrationInterface {
  name = 'DropDocumentSequences1787302893006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS document_sequences`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS document_sequences (
        id SERIAL PRIMARY KEY,
        document_type VARCHAR(50) NOT NULL,
        year INT NOT NULL,
        prefix VARCHAR(10) NOT NULL,
        last_number INT NOT NULL DEFAULT 0,
        CONSTRAINT uq_document_sequences_type_year UNIQUE (document_type, year)
      )
    `);
  }
}
