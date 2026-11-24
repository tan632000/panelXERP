import {
  connectScratchDataSource,
  inScratchSchema,
} from '@plugins/sales/template/database/quotation-template-scratch.helper-spec';
import { TEMPLATE_IN_LIVE_PROJECT_SQL } from '@plugins/sales/template/services/quotation-template.service';

import type { DataSource } from 'typeorm';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

describeWithDatabase('TEMPLATE_IN_LIVE_PROJECT_SQL (real Postgres)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await connectScratchDataSource();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  /** Seeds projects as [templateId, isDeleted] pairs and asks whether template 1 is in use. */
  const usedBy = (projects: Array<[number | null, boolean]>) =>
    inScratchSchema(
      dataSource,
      async (runner) => {
        await runner.query(`
          CREATE TABLE projects (
            id SERIAL PRIMARY KEY,
            quotation_template_id INT,
            is_deleted BOOLEAN NOT NULL DEFAULT false
          )`);
        for (const [templateId, isDeleted] of projects) {
          await runner.query(
            `INSERT INTO projects (quotation_template_id, is_deleted) VALUES ($1, $2)`,
            [templateId, isDeleted],
          );
        }
        result = (await runner.query(
          TEMPLATE_IN_LIVE_PROJECT_SQL,
          [1],
        )) as unknown[];
      },
      { migrate: false },
    );
  let result: unknown[];

  it('reports a live project that names the template', async () => {
    await usedBy([[1, false]]);
    expect(result).toHaveLength(1);
  });

  it('ignores a soft-deleted project', async () => {
    await usedBy([[1, true]]);
    expect(result).toHaveLength(0);
  });

  it('ignores a project that names another template or none', async () => {
    await usedBy([
      [2, false],
      [null, false],
    ]);
    expect(result).toHaveLength(0);
  });
});
