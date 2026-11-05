import { Logger } from '@nestjs/common';

import type { MigrationInterface, QueryRunner } from 'typeorm';

const STAGES = `'material_prep', 'enclosure', 'device_mounting', 'wiring', 'internal_test', 'finishing'`;
const STAGE_CODE = `(material_prep|enclosure|device_mounting|wiring|internal_test|finishing)`;
const DATE = `([0-9]{4}-[0-9]{2}-[0-9]{2})`;

/**
 * Stage events keep their stage code in `stage`, and cabinet update events keep the assignee
 * name and the planned end date in columns of their own, so the history can label them instead
 * of printing the sentence that used to sit in `reason`.
 *
 * The stage enum values exist only where the progress feature ran its migration, so every
 * comparison on `event` goes through `::text`: a literal the enum lacks would fail the whole
 * statement, not match nothing.
 */
export class AddEventAssigneePlannedEnd1793810413026 implements MigrationInterface {
  name = 'AddEventAssigneePlannedEnd1793810413026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE production_order_events
        ADD COLUMN IF NOT EXISTS assignee_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS planned_end_date DATE
    `);
    await queryRunner.query(`
      UPDATE production_order_events
         SET stage = reason, reason = NULL
       WHERE event::text IN ('stage_started', 'stage_finished')
         AND stage IS NULL AND reason IN (${STAGES})
    `);
    // "<code>: <reason>"; `.` spans newlines, so a reason of several lines stays whole.
    await queryRunner.query(`
      UPDATE production_order_events e
         SET stage = parsed.parts[1], reason = NULLIF(parsed.parts[2], '')
        FROM (
          SELECT id, regexp_match(reason, '^${STAGE_CODE}: (.*)$') AS parts
            FROM production_order_events
           WHERE event::text = 'stage_undone' AND stage IS NULL
        ) parsed
       WHERE e.id = parsed.id AND parsed.parts IS NOT NULL
    `);
    // The date closes the string, so a name may hold "; " and ": ". Both columns are
    // filled by the first statement that matches, so the later ones skip a row it took.
    await queryRunner.query(`
      UPDATE production_order_events e
         SET assignee_name = parsed.parts[1], planned_end_date = parsed.parts[2]::date,
             reason = NULL
        FROM (
          SELECT id, regexp_match(reason, '^assignee: (.*); planned end: ${DATE}$') AS parts
            FROM production_order_events
           WHERE event::text = 'unit_updated'
        ) parsed
       WHERE e.id = parsed.id AND parsed.parts IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE production_order_events
         SET planned_end_date = substring(reason FROM '^planned end: ${DATE}$')::date,
             reason = NULL
       WHERE event::text = 'unit_updated'
         AND reason ~ '^planned end: ${DATE}$'
    `);
    await queryRunner.query(`
      UPDATE production_order_events
         SET assignee_name = substring(reason FROM '^assignee: (.*)$'), reason = NULL
       WHERE event::text = 'unit_updated'
         AND assignee_name IS NULL AND planned_end_date IS NULL
         AND reason ~ '^assignee: '
    `);
    const [{ stageUnparsed, updateUnparsed }] = (await queryRunner.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE event::text IN ('stage_started', 'stage_finished', 'stage_undone')
            AND stage IS NULL)::int AS "stageUnparsed",
        COUNT(*) FILTER (
          WHERE event::text = 'unit_updated' AND reason IS NOT NULL
            AND assignee_name IS NULL AND planned_end_date IS NULL)::int AS "updateUnparsed"
      FROM production_order_events
    `)) as Array<{ stageUnparsed: number; updateUnparsed: number }>;
    new Logger(AddEventAssigneePlannedEnd1793810413026.name).log(
      `${stageUnparsed} stage event(s) and ${updateUnparsed} unit_updated event(s) did not parse and were left unchanged`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE production_order_events
         SET reason = CASE WHEN event::text = 'stage_undone'
                           THEN stage || ': ' || COALESCE(reason, '')
                           ELSE stage END
       WHERE event::text IN ('stage_started', 'stage_finished', 'stage_undone')
         AND stage IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE production_order_events
         SET stage = NULL
       WHERE event::text IN ('stage_started', 'stage_finished', 'stage_undone')
    `);
    await queryRunner.query(`
      UPDATE production_order_events
         SET reason = concat_ws(
               '; ',
               'assignee: ' || assignee_name,
               'planned end: ' || to_char(planned_end_date, 'YYYY-MM-DD'))
       WHERE event::text = 'unit_updated'
         AND (assignee_name IS NOT NULL OR planned_end_date IS NOT NULL)
    `);
    await queryRunner.query(`
      ALTER TABLE production_order_events
        DROP COLUMN IF EXISTS assignee_name,
        DROP COLUMN IF EXISTS planned_end_date
    `);
  }
}
