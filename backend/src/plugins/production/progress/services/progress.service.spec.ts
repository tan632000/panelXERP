import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

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

interface UnitBody {
  id: number;
  doneCount: number;
  currentStage: string | null;
  productionOrderStatus: string;
  stages: Array<{
    stage: string;
    status: string;
    startedAt: string | null;
    startedByName: string | null;
    doneAt: string | null;
    doneByName: string | null;
  }>;
}
interface PageBody {
  data: Array<{ id: number; currentStage: string | null }>;
  meta: { total: number };
}
const unit = (res: { body: unknown }) => res.body as UnitBody;

/**
 * Stage tracking over HTTP against the real Postgres of the compose stack: the order of the
 * stages, who may work a cabinet, completion of the production order with its notices, undo,
 * and the reads under each data scope.
 */
describeWithDatabase('Stage tracking (real Postgres)', () => {
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

  it('refuses a stage before the previous one is done, and records who and when', async () => {
    const { units } = await releasedOrder(h);
    const [first] = units;

    await h
      .post(
        stagePath(first.id, ProductionStage.ENCLOSURE, 'start'),
        {},
        'techA',
      )
      .expect(409);
    await h
      .post(
        stagePath(first.id, ProductionStage.MATERIAL_PREP, 'finish'),
        {},
        'techA',
      )
      .expect(409);

    const started = await h
      .post(
        stagePath(first.id, ProductionStage.MATERIAL_PREP, 'start'),
        {},
        'techA',
      )
      .expect(200);
    expect(unit(started).currentStage).toBe('material_prep');
    // The previous stage is in progress, not done.
    await h
      .post(
        stagePath(first.id, ProductionStage.ENCLOSURE, 'start'),
        {},
        'techA',
      )
      .expect(409);
    // Starting twice is not allowed either.
    await h
      .post(
        stagePath(first.id, ProductionStage.MATERIAL_PREP, 'start'),
        {},
        'techA',
      )
      .expect(409);

    const finished = await h
      .post(
        stagePath(first.id, ProductionStage.MATERIAL_PREP, 'finish'),
        {},
        'techA',
      )
      .expect(200);
    const prep = unit(finished).stages[0];
    expect(prep).toMatchObject({
      stage: 'material_prep',
      status: 'done',
      startedByName: expect.any(String) as string,
      doneByName: expect.any(String) as string,
    });
    expect(prep.startedAt).not.toBeNull();
    expect(prep.doneAt).not.toBeNull();
    expect(unit(finished)).toMatchObject({
      doneCount: 1,
      currentStage: 'enclosure',
    });
    await h
      .post(`/production/units/${first.id}/stages/painting/start`, {}, 'techA')
      .expect(400);
  });

  it('lets only the assignee or a manager work a cabinet, and reads follow the data scope', async () => {
    const { orderId, id, units } = await releasedOrder(h);
    const [first] = units;

    // Another technician neither reads nor works it: the cabinet is not theirs to know.
    await h.get(`/production/units/${first.id}`, 'techB').expect(404);
    await h
      .post(
        stagePath(first.id, ProductionStage.MATERIAL_PREP, 'start'),
        {},
        'techB',
      )
      .expect(404);
    expect(
      (await h.get(`/production/units?productionOrderId=${id}`, 'techB')).body,
    ).toMatchObject({ data: [], meta: { total: 0 } });

    // The sales owner follows it but cannot run it; another sales actor does not see it.
    await h.get(`/production/units/${first.id}`, 'salesA').expect(200);
    await h
      .post(
        stagePath(first.id, ProductionStage.MATERIAL_PREP, 'start'),
        {},
        'salesA',
      )
      .expect(403);
    await h.get(`/production/units/${first.id}`, 'salesB').expect(404);
    expect(
      (await h.get(`/production/units?productionOrderId=${id}`, 'salesB')).body,
    ).toMatchObject({ data: [], meta: { total: 0 } });

    // A production manager works any cabinet.
    await h
      .post(
        stagePath(first.id, ProductionStage.MATERIAL_PREP, 'start'),
        {},
        'manager',
      )
      .expect(200);
    expect(await h.notices('techB', orderId)).toEqual([]);
  });

  it('completes the production order once, with one notice per audience', async () => {
    const { orderId, id, units } = await releasedOrder(h, 2);
    const [first, second] = units;

    await runStages(h, first.id);
    expect(await h.statusOfProduction(id)).toBe('released');
    await runStages(h, second.id, PRODUCTION_STAGES, 'techA', true);
    expect(await h.statusOfProduction(id)).toBe('released');
    const done = await h
      .post(
        stagePath(second.id, ProductionStage.FINISHING, 'finish'),
        {},
        'techA',
      )
      .expect(200);

    expect(unit(done)).toMatchObject({
      doneCount: 6,
      currentStage: null,
      productionOrderStatus: 'completed',
    });
    expect(await h.statusOfProduction(id)).toBe('completed');
    // The sales order stays in production until deliveries exist.
    expect(await h.statusOfOrder(orderId)).toBe('in_production');
    expect(await eventCount(id, 'completed')).toBe(1);

    const completed = async (as: Parameters<ProductionHarness['notices']>[0]) =>
      (await h.notices(as, orderId))
        .map((notice) => notice.eventType)
        .filter((type) => type.startsWith('production.order.completed'));
    expect(await completed('manager')).toEqual(['production.order.completed']);
    expect(await completed('salesA')).toEqual([
      'production.order.completed.owner',
    ]);
    expect(await completed('techA')).toEqual([]);
    expect(await completed('salesB')).toEqual([]);

    // Nothing moves once it is completed.
    await h
      .post(
        stagePath(first.id, ProductionStage.FINISHING, 'finish'),
        {},
        'techA',
      )
      .expect(409);
  });

  it('lets only a manager undo the latest finished stage whose next stage is pending', async () => {
    const { id, units } = await releasedOrder(h);
    const [first] = units;
    await runStages(h, first.id, [
      ProductionStage.MATERIAL_PREP,
      ProductionStage.ENCLOSURE,
    ]);

    await h
      .post(
        stagePath(first.id, ProductionStage.ENCLOSURE, 'undo'),
        { reason: 'Wrong panel' },
        'techA',
      )
      .expect(403);
    await h
      .post(
        stagePath(first.id, ProductionStage.ENCLOSURE, 'undo'),
        {},
        'manager',
      )
      .expect(400);
    // A stage that is not done cannot be undone.
    await h
      .post(
        stagePath(first.id, ProductionStage.DEVICE_MOUNTING, 'undo'),
        { reason: 'x' },
        'manager',
      )
      .expect(409);

    // Once the next stage started, the earlier one is locked in.
    await h
      .post(
        stagePath(first.id, ProductionStage.DEVICE_MOUNTING, 'start'),
        {},
        'techA',
      )
      .expect(200);
    await h
      .post(
        stagePath(first.id, ProductionStage.ENCLOSURE, 'undo'),
        { reason: 'Wrong panel' },
        'manager',
      )
      .expect(409);

    // Back in the pending state of the next stage, the undo works.
    await h
      .post(
        stagePath(first.id, ProductionStage.DEVICE_MOUNTING, 'finish'),
        {},
        'techA',
      )
      .expect(200);
    const undone = await h
      .post(
        stagePath(first.id, ProductionStage.DEVICE_MOUNTING, 'undo'),
        { reason: 'Missing breaker' },
        'manager',
      )
      .expect(200);
    expect(unit(undone)).toMatchObject({
      doneCount: 2,
      currentStage: 'device_mounting',
    });
    expect(unit(undone).stages[2]).toMatchObject({
      status: 'in_progress',
      doneAt: null,
      doneByName: null,
    });
    expect(await eventCount(id, 'stage_undone')).toBe(1);
  });

  it('records the stage of a start, a finish and an undo in its own column, with only a typed reason', async () => {
    const { id, units } = await releasedOrder(h);
    const [first] = units;
    const as = (action: 'start' | 'finish' | 'undo', body: object = {}) =>
      h
        .post(
          stagePath(first.id, ProductionStage.MATERIAL_PREP, action),
          body,
          action === 'undo' ? 'manager' : 'techA',
        )
        .expect(200);
    await as('start');
    await as('finish');
    await as('undo', { reason: 'Wrong: panel' });

    const events: Array<{
      event: string;
      stage: string | null;
      reason: string | null;
    }> = await h.dataSource.query(
      `SELECT event, stage, reason FROM production_order_events
          WHERE production_order_id = $1 AND event::text LIKE 'stage_%' ORDER BY id`,
      [id],
    );
    expect(events).toEqual([
      { event: 'stage_started', stage: 'material_prep', reason: null },
      { event: 'stage_finished', stage: 'material_prep', reason: null },
      { event: 'stage_undone', stage: 'material_prep', reason: 'Wrong: panel' },
    ]);
  });

  it('refuses an undo and any stage work once the production order is completed or cancelled', async () => {
    const finished = await releasedOrder(h);
    await runStages(h, finished.units[0].id);
    expect(await h.statusOfProduction(finished.id)).toBe('completed');
    await h
      .post(
        stagePath(finished.units[0].id, ProductionStage.FINISHING, 'undo'),
        { reason: 'Too late' },
        'manager',
      )
      .expect(409);

    const cancelled = await releasedOrder(h);
    await h
      .post(`/production/orders/${cancelled.id}/cancel`, {
        reason: 'Customer left',
      })
      .expect(200);
    await h
      .post(
        stagePath(
          cancelled.units[0].id,
          ProductionStage.MATERIAL_PREP,
          'start',
        ),
        {},
        'techA',
      )
      .expect(409);
    await h
      .post(
        stagePath(
          cancelled.units[0].id,
          ProductionStage.MATERIAL_PREP,
          'start',
        ),
        {},
        'manager',
      )
      .expect(409);
  });

  it('lists the cabinets by assignee, production order and current stage, without a price', async () => {
    const { id, units } = await releasedOrder(h, 2);
    const [first, second] = units;
    await runStages(h, first.id, [ProductionStage.MATERIAL_PREP]);
    await h
      .post(
        stagePath(first.id, ProductionStage.ENCLOSURE, 'start'),
        {},
        'techA',
      )
      .expect(200);

    const page = async (
      query: string,
      as: Parameters<ProductionHarness['get']>[1],
    ) =>
      (
        await h
          .get(`/production/units?productionOrderId=${id}&${query}`, as)
          .expect(200)
      ).body as PageBody;
    expect(
      (await page('mine=true', 'techA')).data.map((row) => row.id).sort(),
    ).toEqual([first.id, second.id].sort());
    expect((await page('mine=true', 'manager')).data).toEqual([]);
    expect(
      (await page('stageStatus=in_progress', 'manager')).data.map(
        (row) => row.id,
      ),
    ).toEqual([first.id]);
    expect(
      (await page('stageStatus=pending', 'manager')).data.map((row) => row.id),
    ).toEqual([second.id]);
    expect((await page('stageStatus=done', 'manager')).data).toEqual([]);
    await h.get(`/production/units?stageStatus=late`, 'manager').expect(400);

    for (const as of ['manager', 'techA', 'salesA', 'director'] as const) {
      expectNoMoneyKeys(
        (await h.get(`/production/units/${first.id}`, as)).body,
      );
      expectNoMoneyKeys(
        (await h.get(`/production/units?productionOrderId=${id}`, as)).body,
      );
    }
  });
});
