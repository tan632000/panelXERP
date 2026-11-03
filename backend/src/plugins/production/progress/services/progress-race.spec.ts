import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import {
  PRODUCTION_STAGES,
  ProductionStage,
} from '@plugins/production/production-order/enums/production-stage.enum';
import {
  describeWithDatabase,
  type ProductionHarness,
} from '@plugins/production/production-order/production-db.helper-spec';
import {
  openProgressHarness,
  releasedOrder,
  runStages,
  stagePath,
} from '@plugins/production/progress/progress-db.helper-spec';

import type { Response } from 'supertest';

const HEADER_LOCK = `SELECT id FROM production_orders WHERE id = $1 FOR UPDATE`;

const statusOf = (result: PromiseSettledResult<Response>) =>
  result.status === 'fulfilled' ? result.value.status : 'rejected';

/**
 * Stage work racing itself and a reassignment on the real Postgres of the compose stack. Each
 * race holds the production order header in a transaction of its own until every contender is
 * queued behind it, so the contenders really overlap and run in the order they queued.
 */
describeWithDatabase('Stage tracking races (real Postgres)', () => {
  jest.setTimeout(90_000);

  let h: ProductionHarness;

  beforeAll(async () => {
    h = await openProgressHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  const eventCount = async (id: number, event: string) => {
    const [row]: Array<{ n: string }> = await h.dataSource.query(
      `SELECT COUNT(*) AS n FROM production_order_events
        WHERE production_order_id = $1 AND event = $2`,
      [id, event],
    );
    return Number(row.n);
  };

  const finishing = (unitId: number) => () =>
    h.post(stagePath(unitId, ProductionStage.FINISHING, 'finish'), {}, 'techA');

  it('completes the order once when the last two cabinets finish together, queued behind the header', async () => {
    const { orderId, id, units } = await releasedOrder(h, 2);
    for (const { id: unitId } of units) {
      await runStages(h, unitId, PRODUCTION_STAGES, 'techA', true);
    }

    const results = await queuedBehind<Response>(
      h.dataSource,
      HEADER_LOCK,
      [id],
      units.map(({ id: unitId }) => finishing(unitId)),
    );

    expect(results.map(statusOf)).toEqual([200, 200]);
    expect(await h.statusOfProduction(id)).toBe('completed');
    expect(await eventCount(id, 'completed')).toBe(1);
    const completed = (await h.notices('manager', orderId)).filter(
      (notice) => notice.eventType === 'production.order.completed',
    );
    expect(completed).toHaveLength(1);
    expect(
      (await h.notices('salesA', orderId)).filter(
        (notice) => notice.eventType === 'production.order.completed.owner',
      ),
    ).toHaveLength(1);
  });

  it('stops the old assignee once a reassignment queued ahead of their finish commits', async () => {
    const { id, units } = await releasedOrder(h);
    const [target] = units;
    await runStages(
      h,
      target.id,
      [ProductionStage.MATERIAL_PREP],
      'techA',
      true,
    );

    const [reassign, oldFinish] = await queuedBehind<Response>(
      h.dataSource,
      HEADER_LOCK,
      [id],
      [
        () => h.assign(id, target.id, { assigneeId: h.actors.techB.userId }),
        () =>
          h.post(
            stagePath(target.id, ProductionStage.MATERIAL_PREP, 'finish'),
            {},
            'techA',
          ),
      ],
    );

    expect(statusOf(reassign)).toBe(200);
    expect(statusOf(oldFinish)).toBe(404);
    const [{ status }]: Array<{ status: string }> = await h.dataSource.query(
      `SELECT status FROM production_unit_stages WHERE unit_id = $1 AND stage = $2`,
      [target.id, ProductionStage.MATERIAL_PREP],
    );
    expect(status).toBe('in_progress');
    await h
      .post(
        stagePath(target.id, ProductionStage.MATERIAL_PREP, 'finish'),
        {},
        'techB',
      )
      .expect(200);
  });

  it('takes the header before the unit in both a finish and a reassignment, so neither deadlocks', async () => {
    const { id, units } = await releasedOrder(h);
    const [target] = units;
    await runStages(
      h,
      target.id,
      [ProductionStage.MATERIAL_PREP],
      'techA',
      true,
    );

    const results = await queuedBehind<Response>(
      h.dataSource,
      HEADER_LOCK,
      [id],
      [
        () =>
          h.post(
            stagePath(target.id, ProductionStage.MATERIAL_PREP, 'finish'),
            {},
            'techA',
          ),
        () => h.assign(id, target.id, { assigneeId: h.actors.techB.userId }),
      ],
    );

    expect(results.map(statusOf)).toEqual([200, 200]);
    for (const result of results) {
      expect(
        result.status === 'fulfilled' ? JSON.stringify(result.value.body) : '',
      ).not.toContain('deadlock');
    }
  });
});
