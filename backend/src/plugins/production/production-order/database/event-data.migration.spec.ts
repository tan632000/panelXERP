import { Logger } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';

import { AddEventAssigneePlannedEnd1793810413026 } from '@plugins/production/production-order/database/migrations/1793810413026-add-event-assignee-planned-end';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

interface EventRow {
  stage: string | null;
  reason: string | null;
  assignee_name: string | null;
  planned_end_date: string | null;
}

/**
 * The migration runs against a copy of the events table in a schema of its own, inside a
 * transaction that is always rolled back. Only that schema is on the search path (`SET LOCAL`),
 * and the migration names its tables unqualified, so it can never reach the real table and no
 * other spec sees the DDL.
 */
describeWithDatabase('AddEventAssigneePlannedEnd (real Postgres)', () => {
  const migration = new AddEventAssigneePlannedEnd1793810413026();
  const BASE_VALUES = ['created', 'released', 'cancelled', 'unit_updated'];
  const STAGE_VALUES = ['stage_started', 'stage_finished', 'stage_undone'];
  const ISSUE_VALUES = ['issue_reported', 'issue_resolved'];

  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [],
    });
    try {
      await dataSource.initialize();
    } catch (error: unknown) {
      throw new Error(
        `Postgres is unreachable (${error instanceof Error ? error.message : String(error)}). Run inside the compose backend container, or set SKIP_DB_SPECS=1 to skip these checks.`,
      );
    }
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  async function inScratchSchema(
    eventValues: string[],
    run: (runner: QueryRunner) => Promise<void>,
  ): Promise<void> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const schema = `scratch_event_data_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      await runner.query(`CREATE SCHEMA ${schema}`);
      await runner.query(`SET LOCAL search_path TO ${schema}`);
      const values = eventValues.map((value) => `'${value}'`).join(', ');
      await runner.query(
        `CREATE TYPE production_order_event_type AS ENUM (${values})`,
      );
      await runner.query(`
        CREATE TABLE production_order_events (
          id SERIAL PRIMARY KEY,
          production_order_id INT NOT NULL,
          event production_order_event_type NOT NULL,
          actor_id INT NOT NULL,
          unit_code VARCHAR(60),
          stage VARCHAR(40),
          severity VARCHAR(20),
          reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await run(runner);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  }

  const insert = async (
    runner: QueryRunner,
    event: string,
    reason: string | null,
    stage: string | null = null,
  ): Promise<number> => {
    const [row] = (await runner.query(
      `INSERT INTO production_order_events (production_order_id, event, actor_id, stage, reason)
       VALUES (1, $1, 1, $2, $3) RETURNING id`,
      [event, stage, reason],
    )) as Array<{ id: number }>;
    return row.id;
  };

  const rowOf = async (runner: QueryRunner, id: number): Promise<EventRow> => {
    const [row] = (await runner.query(
      `SELECT stage, reason, assignee_name, planned_end_date::text AS planned_end_date
         FROM production_order_events WHERE id = $1`,
      [id],
    )) as EventRow[];
    return row;
  };

  const oldShapeOf = async (runner: QueryRunner, ids: number[]) =>
    (
      (await runner.query(
        `SELECT id, stage, reason FROM production_order_events WHERE id = ANY($1) ORDER BY id`,
        [ids],
      )) as Array<{ id: number; stage: string | null; reason: string | null }>
    ).map((row) => [row.stage, row.reason]);

  const columnsOf = async (runner: QueryRunner) =>
    (
      (await runner.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'production_order_events'
            AND column_name IN ('assignee_name', 'planned_end_date')`,
      )) as Array<{ column_name: string }>
    ).map((row) => row.column_name);

  it('moves the stage and the cabinet update data into their columns and folds them back on down', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    try {
      await inScratchSchema(
        [...BASE_VALUES, ...STAGE_VALUES, ...ISSUE_VALUES],
        async (runner) => {
          const started = await insert(runner, 'stage_started', 'wiring');
          const unparsedStage = await insert(runner, 'stage_started', 'foo');
          const finished = await insert(runner, 'stage_finished', 'finishing');
          const undone = await insert(
            runner,
            'stage_undone',
            'enclosure: Wrong panel: see\nsecond line',
          );
          const undoneEmpty = await insert(
            runner,
            'stage_undone',
            'device_mounting: ',
          );
          const assigneeOnly = await insert(
            runner,
            'unit_updated',
            'assignee: Nguyen Van A',
          );
          const dateOnly = await insert(
            runner,
            'unit_updated',
            'planned end: 2026-11-20',
          );
          const both = await insert(
            runner,
            'unit_updated',
            'assignee: Tran; Van: B; planned end: 2026-11-20',
          );
          const numericName = await insert(
            runner,
            'unit_updated',
            'assignee: 42; planned end: 2026-01-05',
          );
          const unparsedUpdate = await insert(
            runner,
            'unit_updated',
            'changed by hand',
          );
          const reported = await insert(
            runner,
            'issue_reported',
            'High: text',
            'wiring',
          );
          const created = await insert(runner, 'created', null);

          await migration.up(runner);

          expect(await rowOf(runner, started)).toMatchObject({
            stage: 'wiring',
            reason: null,
          });
          expect(await rowOf(runner, finished)).toMatchObject({
            stage: 'finishing',
            reason: null,
          });
          expect(await rowOf(runner, undone)).toMatchObject({
            stage: 'enclosure',
            reason: 'Wrong panel: see\nsecond line',
          });
          expect(await rowOf(runner, undoneEmpty)).toMatchObject({
            stage: 'device_mounting',
            reason: null,
          });
          expect(await rowOf(runner, assigneeOnly)).toEqual({
            stage: null,
            reason: null,
            assignee_name: 'Nguyen Van A',
            planned_end_date: null,
          });
          expect(await rowOf(runner, dateOnly)).toEqual({
            stage: null,
            reason: null,
            assignee_name: null,
            planned_end_date: '2026-11-20',
          });
          // The date is anchored at the end: the name keeps its own "; " and ": ".
          expect(await rowOf(runner, both)).toEqual({
            stage: null,
            reason: null,
            assignee_name: 'Tran; Van: B',
            planned_end_date: '2026-11-20',
          });
          expect(await rowOf(runner, numericName)).toMatchObject({
            assignee_name: '42',
            planned_end_date: '2026-01-05',
            reason: null,
          });
          // Rows that do not parse stay as they were, and are counted in the log.
          expect(await rowOf(runner, unparsedStage)).toEqual({
            stage: null,
            reason: 'foo',
            assignee_name: null,
            planned_end_date: null,
          });
          expect(await rowOf(runner, unparsedUpdate)).toEqual({
            stage: null,
            reason: 'changed by hand',
            assignee_name: null,
            planned_end_date: null,
          });
          expect(await rowOf(runner, reported)).toMatchObject({
            stage: 'wiring',
            reason: 'High: text',
          });
          expect(await rowOf(runner, created)).toMatchObject({ stage: null });
          expect(log).toHaveBeenCalledWith(
            expect.stringContaining(
              '1 stage event(s) and 1 unit_updated event(s) did not parse',
            ),
          );

          await migration.down(runner);

          expect(await columnsOf(runner)).toEqual([]);
          expect(
            await oldShapeOf(runner, [
              started,
              unparsedStage,
              finished,
              undone,
              undoneEmpty,
              assigneeOnly,
              dateOnly,
              both,
              numericName,
              unparsedUpdate,
              reported,
              created,
            ]),
          ).toEqual([
            [null, 'wiring'],
            [null, 'foo'],
            [null, 'finishing'],
            [null, 'enclosure: Wrong panel: see\nsecond line'],
            [null, 'device_mounting: '],
            [null, 'assignee: Nguyen Van A'],
            [null, 'planned end: 2026-11-20'],
            [null, 'assignee: Tran; Van: B; planned end: 2026-11-20'],
            [null, 'assignee: 42; planned end: 2026-01-05'],
            [null, 'changed by hand'],
            // An issue event keeps its stage.
            ['wiring', 'High: text'],
            [null, null],
          ]);
        },
      );
    } finally {
      log.mockRestore();
    }
  });

  it('runs up and down where the enum never received the stage values', async () => {
    await inScratchSchema(BASE_VALUES, async (runner) => {
      const updated = await insert(
        runner,
        'unit_updated',
        'planned end: 2026-11-20',
      );

      await migration.up(runner);

      expect((await columnsOf(runner)).sort()).toEqual([
        'assignee_name',
        'planned_end_date',
      ]);
      expect(await rowOf(runner, updated)).toMatchObject({
        reason: null,
        planned_end_date: '2026-11-20',
      });

      await migration.down(runner);

      expect(await columnsOf(runner)).toEqual([]);
      expect(await oldShapeOf(runner, [updated])).toEqual([
        [null, 'planned end: 2026-11-20'],
      ]);
    });
  });
});
