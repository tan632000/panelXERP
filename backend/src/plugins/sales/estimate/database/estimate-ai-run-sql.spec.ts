/* eslint-disable @typescript-eslint/no-unsafe-assignment -- QueryRunner.query answers untyped driver rows; each result is asserted right after */
import { isUniqueViolationOn } from '@shared/utils/db-error.util';

import { AddEstimateAiFields1795364024211 } from '@plugins/sales/estimate/database/migrations/1795364024211-add-estimate-ai-fields';
import {
  ACTIVE_RUN_INDEX,
  CLAIM_RUN_SQL,
  DAILY_RUN_COUNT_SQL,
  TEMPLATE_SQL,
} from '@plugins/sales/estimate/services/estimate-ai-prefill.service';
import { SWEEP_STUCK_RUNS_SQL } from '@plugins/sales/estimate/services/estimate-ai-sweeper.service';
import { LIVE_ITEMS_SQL } from '@plugins/sales/estimate/services/estimate-ai-writer.service';
import {
  connectScratchDataSource,
  inScratchSchema,
} from '@plugins/sales/template/database/quotation-template-scratch.helper-spec';

import type { DataSource, QueryRunner } from 'typeorm';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

/**
 * The raw SQL of the AI run (claim, sweep, live items, daily count, template read) is run as the
 * services run it, on real Postgres, in a scratch schema that is always rolled back. The schema
 * holds stand-ins of the tables outside the estimate feature plus the real template and AI-run
 * migrations, so the partial unique index and the status CHECK are the production ones. The
 * writer and the trigger themselves are not run here; only their statements are.
 */
describeWithDatabase('estimate AI run SQL (real Postgres)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await connectScratchDataSource();
  });
  afterAll(async () => {
    await dataSource?.destroy();
  });

  const inSchema = (run: (runner: QueryRunner) => Promise<void>) =>
    inScratchSchema(dataSource, async (runner) => {
      for (const table of [
        'sales_requests',
        'sales_estimates',
        'sales_estimate_panels',
        'sales_estimate_bom_lines',
      ]) {
        await runner.query(`CREATE TABLE ${table} (id SERIAL PRIMARY KEY)`);
      }
      await runner.query(
        `CREATE TABLE projects (
           id SERIAL PRIMARY KEY,
           quotation_template_id INT,
           is_deleted BOOLEAN NOT NULL DEFAULT false
         )`,
      );
      await new AddEstimateAiFields1795364024211().up(runner);
      await runner.query(`INSERT INTO users DEFAULT VALUES`);
      await runner.query(`INSERT INTO sales_requests DEFAULT VALUES`);
      await runner.query(`INSERT INTO sales_requests DEFAULT VALUES`);
      await run(runner);
    });

  const insertRun = async (
    runner: QueryRunner,
    requestId: number,
    status = 'queued',
    createdAt = 'now()',
  ): Promise<number> => {
    const rows: Array<{ id: number }> = await runner.query(
      `INSERT INTO sales_estimate_ai_runs (request_id, status, created_by, created_at)
       VALUES ($1, $2, 1, ${createdAt}) RETURNING id`,
      [requestId, status],
    );
    return rows[0].id;
  };

  const statusOf = async (runner: QueryRunner, id: number): Promise<string> => {
    const rows: Array<{ status: string }> = await runner.query(
      `SELECT status FROM sales_estimate_ai_runs WHERE id = $1`,
      [id],
    );
    return rows[0].status;
  };

  describe('one active run per request', () => {
    it('refuses a second queued or running run with the constraint the service recognises', async () => {
      await inSchema(async (runner) => {
        await insertRun(runner, 1, 'queued');
        await runner.query('SAVEPOINT attempt');
        const error: unknown = await insertRun(runner, 1, 'running').catch(
          (e: unknown) => e,
        );
        await runner.query('ROLLBACK TO SAVEPOINT attempt');

        expect(isUniqueViolationOn(error, [ACTIVE_RUN_INDEX])).toBe(true);
        // Another request is not affected.
        await expect(insertRun(runner, 2, 'queued')).resolves.toBeGreaterThan(
          0,
        );
      });
    });

    it.each(['failed', 'succeeded'])(
      'accepts a new run once the earlier one is %s',
      async (finished) => {
        await inSchema(async (runner) => {
          const first = await insertRun(runner, 1, 'queued');
          await runner.query(
            `UPDATE sales_estimate_ai_runs SET status = $2 WHERE id = $1`,
            [first, finished],
          );

          await expect(insertRun(runner, 1, 'queued')).resolves.toBeGreaterThan(
            first,
          );
        });
      },
    );
  });

  describe('claiming a run', () => {
    it('answers [rows, count] once and nothing the second time', async () => {
      await inSchema(async (runner) => {
        const id = await insertRun(runner, 1, 'queued');

        const first: [Array<{ id: number }>, number] = await runner.query(
          CLAIM_RUN_SQL,
          [id],
        );
        const second: [Array<{ id: number }>, number] = await runner.query(
          CLAIM_RUN_SQL,
          [id],
        );

        expect(first).toEqual([[{ id }], 1]);
        expect(second).toEqual([[], 0]);
        expect(await statusOf(runner, id)).toBe('running');
      });
    });

    it('does not claim a run that was already failed', async () => {
      await inSchema(async (runner) => {
        const id = await insertRun(runner, 1, 'failed');

        const [rows] = (await runner.query(CLAIM_RUN_SQL, [id])) as [
          unknown[],
          number,
        ];

        expect(rows).toEqual([]);
        expect(await statusOf(runner, id)).toBe('failed');
      });
    });
  });

  describe('sweeping stuck runs', () => {
    it('fails only runs active for more than ten minutes and answers the rows it failed', async () => {
      await inSchema(async (runner) => {
        const stale = await insertRun(
          runner,
          1,
          'running',
          `now() - interval '11 minutes'`,
        );
        const fresh = await insertRun(
          runner,
          2,
          'queued',
          `now() - interval '5 minutes'`,
        );
        const done = await insertRun(
          runner,
          1,
          'succeeded',
          `now() - interval '30 minutes'`,
        );
        const cutoff = new Date(Date.now() - 10 * 60_000);

        const [swept, count] = (await runner.query(SWEEP_STUCK_RUNS_SQL, [
          'AI_TIMEOUT: stuck',
          cutoff,
        ])) as [
          Array<{ id: number; request_id: number; created_by: number }>,
          number,
        ];

        expect(swept).toEqual([{ id: stale, request_id: 1, created_by: 1 }]);
        expect(count).toBe(1);
        expect(await statusOf(runner, stale)).toBe('failed');
        expect(await statusOf(runner, fresh)).toBe('queued');
        expect(await statusOf(runner, done)).toBe('succeeded');
        const rows: Array<{ error: string }> = await runner.query(
          `SELECT error FROM sales_estimate_ai_runs WHERE id = $1`,
          [stale],
        );
        expect(rows[0].error).toBe('AI_TIMEOUT: stuck');
      });
    });
  });

  describe('live catalog items', () => {
    it('returns only items that are alive, locked inside the transaction', async () => {
      await inSchema(async (runner) => {
        const ids: Array<{ id: number }> = await runner.query(
          `INSERT INTO items (code, name, brand, item_group, unit, reference_price, is_deleted)
           VALUES ('A', 'Alive', 'X', 'other', 'Cái', 1500.5, false),
                  ('B', 'Gone', 'X', 'other', 'Cái', NULL, true),
                  ('C', 'Other', NULL, 'other', 'Bộ', 10, false)
           RETURNING id`,
        );
        const [alive, gone] = ids.map((row) => row.id);

        const rows: Array<{
          id: number;
          code: string;
          reference_price: string | null;
        }> = await runner.query(LIVE_ITEMS_SQL, [[alive, gone, alive, 99999]]);

        expect(rows.map((row) => row.id)).toEqual([alive]);
        expect(rows[0]).toMatchObject({
          code: 'A',
          reference_price: '1500.50',
        });
      });
    });
  });

  describe('daily run count', () => {
    it('counts every run of the user in the last day, failed included, and no older one', async () => {
      await inSchema(async (runner) => {
        await runner.query(`INSERT INTO users DEFAULT VALUES`);
        await insertRun(runner, 1, 'failed', `now() - interval '2 hours'`);
        await insertRun(runner, 1, 'succeeded', `now() - interval '23 hours'`);
        await insertRun(runner, 2, 'queued');
        await insertRun(runner, 1, 'failed', `now() - interval '25 hours'`);
        await runner.query(
          `INSERT INTO sales_estimate_ai_runs (request_id, status, created_by)
           VALUES (1, 'failed', 2)`,
        );

        const [row] = (await runner.query(DAILY_RUN_COUNT_SQL, [1])) as Array<{
          n: number;
        }>;

        expect(row.n).toBe(3);
      });
    });
  });

  describe('project template read', () => {
    const seedTemplate = async (
      runner: QueryRunner,
      flags: { active: boolean; deleted: boolean },
    ) => {
      const [item]: Array<{ id: number }> = await runner.query(
        `INSERT INTO items (code, name, item_group, unit) VALUES ('T1', 'T', 'other', 'Cái') RETURNING id`,
      );
      const [template]: Array<{ id: number }> = await runner.query(
        `INSERT INTO quotation_templates (code, name, is_active, is_deleted)
         VALUES ('TPL_0001', 'Lò hơi', $1, $2) RETURNING id`,
        [flags.active, flags.deleted],
      );
      const [panel]: Array<{ id: number }> = await runner.query(
        `INSERT INTO quotation_template_panels (template_id, tag, description, quantity)
         VALUES ($1, 'TU-1', 'Tủ 1', 1) RETURNING id`,
        [template.id],
      );
      await runner.query(
        `INSERT INTO quotation_template_lines (panel_id, item_id, quantity, group_label)
         VALUES ($1, $2, 2, 'Bảo vệ')`,
        [panel.id, item.id],
      );
      const [project]: Array<{ id: number }> = await runner.query(
        `INSERT INTO projects (quotation_template_id) VALUES ($1) RETURNING id`,
        [template.id],
      );
      return project.id;
    };

    it('reads the panels and lines of a live active template', async () => {
      await inSchema(async (runner) => {
        const projectId = await seedTemplate(runner, {
          active: true,
          deleted: false,
        });

        const rows: Array<Record<string, unknown>> = await runner.query(
          TEMPLATE_SQL,
          [projectId],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          tag: 'TU-1',
          panel_quantity: 1,
          line_quantity: '2.000',
          group_label: 'Bảo vệ',
        });
      });
    });

    it.each([
      ['deactivated', { active: false, deleted: false }],
      ['deleted', { active: true, deleted: true }],
    ])('reads nothing for a template that is %s', async (_name, flags) => {
      await inSchema(async (runner) => {
        const projectId = await seedTemplate(runner, flags);

        await expect(runner.query(TEMPLATE_SQL, [projectId])).resolves.toEqual(
          [],
        );
      });
    });

    it('reads nothing for a project without a template or a deleted project', async () => {
      await inSchema(async (runner) => {
        const [bare]: Array<{ id: number }> = await runner.query(
          `INSERT INTO projects DEFAULT VALUES RETURNING id`,
        );
        const projectId = await seedTemplate(runner, {
          active: true,
          deleted: false,
        });
        await runner.query(
          `UPDATE projects SET is_deleted = true WHERE id = $1`,
          [projectId],
        );

        await expect(runner.query(TEMPLATE_SQL, [bare.id])).resolves.toEqual(
          [],
        );
        await expect(runner.query(TEMPLATE_SQL, [projectId])).resolves.toEqual(
          [],
        );
      });
    });
  });
});
