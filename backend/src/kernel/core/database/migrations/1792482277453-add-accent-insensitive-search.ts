import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Accent-insensitive search (customer feedback 2026-10-20): Vietnamese input methods place a
 * tone mark either on the first vowel (old style) or on the second (new style), so the same word
 * arrives as different characters and an ILIKE search misses rows typed the other way. Every
 * search compares `erp_unaccent(column) ILIKE erp_unaccent(:keyword)`, which strips the marks
 * (and folds the stroked d to d) on both sides.
 *
 * `unaccent()` itself is only STABLE, so it is wrapped in an IMMUTABLE function with the
 * dictionary named explicitly; that keeps it usable in an index later.
 */
export class AddAccentInsensitiveSearch1792482277453 implements MigrationInterface {
  name = 'AddAccentInsensitiveSearch1792482277453';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION erp_unaccent(value text)
      RETURNS text
      LANGUAGE sql
      IMMUTABLE PARALLEL SAFE STRICT
      AS $fn$ SELECT public.unaccent('public.unaccent'::regdictionary, value) $fn$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS erp_unaccent(text)`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS unaccent`);
  }
}
