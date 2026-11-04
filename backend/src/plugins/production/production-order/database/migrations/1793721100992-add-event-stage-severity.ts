import { Logger } from '@nestjs/common';

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The stage and severity of an issue event become columns of their own; `reason` keeps only
 * the description or resolution.
 *
 * The issue enum values exist only where the issue feature ran its migration, so every
 * comparison on `event` goes through `::text`: a literal the enum lacks would fail the whole
 * statement, not match nothing.
 */
export class AddEventStageSeverity1793721100992 implements MigrationInterface {
  name = 'AddEventStageSeverity1793721100992';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE production_order_events
        ADD COLUMN IF NOT EXISTS stage VARCHAR(40),
        ADD COLUMN IF NOT EXISTS severity VARCHAR(20)
    `);
    // Rows written as "<stage>, <severity>: <text>"; the text may span lines and hold colons.
    await queryRunner.query(`
      UPDATE production_order_events e
         SET stage = parsed.parts[1], severity = parsed.parts[2], reason = parsed.parts[3]
        FROM (
          SELECT id,
                 regexp_match(reason, '^([a-z_]{1,40}), ([a-z_]{1,20}): (.*)$') AS parts
            FROM production_order_events
           WHERE event::text = 'issue_reported' AND stage IS NULL
        ) parsed
       WHERE e.id = parsed.id AND parsed.parts IS NOT NULL
    `);
    const [{ unparsed }] = (await queryRunner.query(`
      SELECT COUNT(*)::int AS unparsed FROM production_order_events
       WHERE event::text = 'issue_reported' AND stage IS NULL
    `)) as Array<{ unparsed: number }>;
    new Logger(AddEventStageSeverity1793721100992.name).log(
      `${unparsed} issue_reported event(s) did not parse and were left unchanged`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE production_order_events
         SET reason = stage || ', ' || severity || ': ' || COALESCE(reason, '')
       WHERE event::text = 'issue_reported' AND stage IS NOT NULL AND severity IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE production_order_events
        DROP COLUMN IF EXISTS stage,
        DROP COLUMN IF EXISTS severity
    `);
  }
}
