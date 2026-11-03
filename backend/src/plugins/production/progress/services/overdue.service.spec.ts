import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import {
  PRODUCTION_STAGES,
  ProductionStage,
} from '@plugins/production/production-order/enums/production-stage.enum';
import {
  describeWithDatabase,
  openProductionHarness,
  type ActorName,
  type ProductionHarness,
} from '@plugins/production/production-order/production-db.helper-spec';
import {
  releasedOrder,
  runStages,
  stagePath,
} from '@plugins/production/progress/progress-db.helper-spec';
import { ProgressController } from '@plugins/production/progress/progress.controller';
import { OverdueService } from '@plugins/production/progress/services/overdue.service';
import { ProgressQueryService } from '@plugins/production/progress/services/progress-query.service';
import { ProgressService } from '@plugins/production/progress/services/progress.service';

const DAY = '2026-11-02';
const NEXT_DAY = '2026-11-03';
const LATER = '2026-11-10';
const EARLIER = '2026-10-30';

const UNIT_LOCK = `SELECT id FROM production_units WHERE id = $1 FOR UPDATE`;

/**
 * The overdue check against the real Postgres of the compose stack, read the way each person
 * reads it: through their own notification list. The clock is held at a fixed instant so the
 * dates of the re-plans do not depend on the day the suite runs.
 */
describeWithDatabase('Overdue check (real Postgres)', () => {
  jest.setTimeout(90_000);

  let h: ProductionHarness;
  let overdue: OverdueService;

  beforeAll(async () => {
    jest.useFakeTimers({
      now: new Date(`${DAY}T10:00:00Z`),
      advanceTimers: true,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'clearImmediate',
        'queueMicrotask',
        'hrtime',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
      ],
    });
    h = await openProductionHarness([], {
      controllers: [ProgressController],
      providers: [ProgressService, ProgressQueryService, OverdueService],
    });
    overdue = h.app.get(OverdueService);
  });

  afterAll(async () => {
    await h?.close();
    jest.useRealTimers();
  });

  /** The overdue notices of one cabinet that `as` reads, paging past other suites' records. */
  const overdueNotices = async (as: ActorName, unitId: number) => {
    const actor = h.actors[as];
    const found: string[] = [];
    let cursor: number | null = null;
    do {
      const page: Awaited<ReturnType<typeof h.notifications.listForActor>> =
        await h.notifications.listForActor(
          { userId: actor.userId, permissions: actor.permissions },
          100,
          cursor,
        );
      for (const notice of page.data) {
        if (
          notice.eventType.startsWith('production.unit.overdue') &&
          Number(notice.payload.unitId) === unitId
        ) {
          found.push(notice.eventType);
        }
      }
      cursor = page.nextCursor;
    } while (cursor !== null);
    return found;
  };

  const MANAGER_EVENT = 'production.unit.overdue';
  const ASSIGNEE_EVENT = 'production.unit.overdue.assignee';

  /** A released one-cabinet order whose cabinet is planned for `date` and belongs to techA. */
  const lateOrder = async (date: string = DAY) => {
    const released = await releasedOrder(h);
    const [unit] = released.units;
    await h.assign(released.id, unit.id, { plannedEndDate: date }).expect(200);
    return { ...released, unitId: unit.id };
  };

  const rows = async (unitId: number, event: string) => {
    const [row]: Array<{ n: string }> = await h.dataSource.query(
      `SELECT COUNT(*) AS n FROM notifications
        WHERE event_type = $1 AND payload->>'unitId' = $2 AND status = 'open'`,
      [event, String(unitId)],
    );
    return Number(row.n);
  };

  it('notifies on the day after the planned end date, never on it, once per audience', async () => {
    const { unitId } = await lateOrder();

    await overdue.run(DAY);
    expect(await overdueNotices('manager', unitId)).toEqual([]);
    expect(await overdueNotices('techA', unitId)).toEqual([]);

    await overdue.run(NEXT_DAY);
    expect(await overdueNotices('manager', unitId)).toEqual([MANAGER_EVENT]);
    expect(await overdueNotices('techA', unitId)).toEqual([ASSIGNEE_EVENT]);
    expect(await overdueNotices('techB', unitId)).toEqual([]);

    await overdue.run(NEXT_DAY);
    expect(await overdueNotices('manager', unitId)).toEqual([MANAGER_EVENT]);
    expect(await overdueNotices('techA', unitId)).toEqual([ASSIGNEE_EVENT]);
    expect(await rows(unitId, MANAGER_EVENT)).toBe(1);
    expect(await rows(unitId, ASSIGNEE_EVENT)).toBe(1);
  });

  it('keeps one record per audience: the role record names no user, the assignee record no role', async () => {
    const { unitId } = await lateOrder();
    await overdue.run(NEXT_DAY);

    const stored: Array<{
      event_type: string;
      role_codes: string[];
      user_ids: number[];
      dedupe_key: string;
    }> = await h.dataSource.query(
      `SELECT event_type, role_codes, user_ids, dedupe_key FROM notifications
        WHERE event_type LIKE 'production.unit.overdue%' AND payload->>'unitId' = $1`,
      [String(unitId)],
    );

    expect(stored).toHaveLength(2);
    const byEvent = Object.fromEntries(
      stored.map((row) => [row.event_type, row]),
    );
    expect(byEvent[MANAGER_EVENT]).toMatchObject({
      role_codes: ['productionManager'],
      user_ids: [],
      dedupe_key: `unit:${unitId}`,
    });
    expect(byEvent[ASSIGNEE_EVENT]).toMatchObject({
      role_codes: [],
      user_ids: [h.actors.techA.userId],
      dedupe_key: `unit:${unitId}`,
    });
  });

  it('clears both notices when the finishing stage is done', async () => {
    const { unitId } = await lateOrder();
    await overdue.run(NEXT_DAY);
    expect(await overdueNotices('manager', unitId)).toHaveLength(1);

    await runStages(h, unitId, PRODUCTION_STAGES, 'techA');

    expect(await overdueNotices('manager', unitId)).toEqual([]);
    expect(await overdueNotices('techA', unitId)).toEqual([]);
    await overdue.run(NEXT_DAY);
    expect(await overdueNotices('manager', unitId)).toEqual([]);
  });

  it('clears both notices when the cabinet is re-planned to today or later, and raises again if it is late again', async () => {
    const { id, unitId } = await lateOrder();
    await overdue.run(NEXT_DAY);

    await h.assign(id, unitId, { plannedEndDate: LATER }).expect(200);

    expect(await overdueNotices('manager', unitId)).toEqual([]);
    expect(await overdueNotices('techA', unitId)).toEqual([]);
    await overdue.run(NEXT_DAY);
    expect(await overdueNotices('manager', unitId)).toEqual([]);

    await h.assign(id, unitId, { plannedEndDate: EARLIER }).expect(200);
    await overdue.run(NEXT_DAY);
    expect(await overdueNotices('manager', unitId)).toEqual([MANAGER_EVENT]);
  });

  it('keeps the notices when a Vietnamese evening re-plans to the day that is already past', async () => {
    const { id, unitId } = await lateOrder(EARLIER);
    await overdue.run(NEXT_DAY);
    jest.setSystemTime(new Date(`${DAY}T23:30:00Z`));
    try {
      await h.assign(id, unitId, { plannedEndDate: DAY }).expect(200);
    } finally {
      jest.setSystemTime(new Date(`${DAY}T10:00:00Z`));
    }

    expect(await overdueNotices('manager', unitId)).toEqual([MANAGER_EVENT]);
    expect(await overdueNotices('techA', unitId)).toEqual([ASSIGNEE_EVENT]);
  });

  it('takes the old assignee notice back on reassignment, keeps the manager one, and tells the new assignee on the next run', async () => {
    const { id, unitId } = await lateOrder();
    await overdue.run(NEXT_DAY);

    await h
      .assign(id, unitId, { assigneeId: h.actors.techB.userId })
      .expect(200);

    expect(await overdueNotices('techA', unitId)).toEqual([]);
    expect(await overdueNotices('manager', unitId)).toEqual([MANAGER_EVENT]);
    expect(await overdueNotices('techB', unitId)).toEqual([]);

    await overdue.run(NEXT_DAY);
    expect(await overdueNotices('techB', unitId)).toEqual([ASSIGNEE_EVENT]);
    expect(await overdueNotices('techA', unitId)).toEqual([]);
    expect(await overdueNotices('manager', unitId)).toEqual([MANAGER_EVENT]);
  });

  it('ignores a cancelled production order and clears what it had raised', async () => {
    const { id, unitId } = await lateOrder();
    await overdue.run(NEXT_DAY);
    expect(await overdueNotices('manager', unitId)).toHaveLength(1);

    await h
      .post(`/production/orders/${id}/cancel`, { reason: 'customer left' })
      .expect(200);

    expect(await overdueNotices('manager', unitId)).toEqual([]);
    expect(await overdueNotices('techA', unitId)).toEqual([]);
    await overdue.run(NEXT_DAY);
    expect(await overdueNotices('manager', unitId)).toEqual([]);
  });

  it('does not look at a draft production order', async () => {
    const orderId = await h.newOrder();
    const created = await h.createProduction(orderId).expect(201);
    const id = (created.body as { id: number }).id;
    const [unit] = await h.units(id);
    await h
      .assign(id, unit.id, {
        assigneeId: h.actors.techA.userId,
        plannedEndDate: EARLIER,
      })
      .expect(200);

    await overdue.run(NEXT_DAY);

    expect(await overdueNotices('manager', unit.id)).toEqual([]);
  });

  it('tells only the role about a cabinet nobody holds', async () => {
    const { unitId } = await lateOrder();
    await h.dataSource.query(
      `UPDATE production_units SET assignee_id = NULL WHERE id = $1`,
      [unitId],
    );

    await overdue.run(NEXT_DAY);

    expect(await overdueNotices('manager', unitId)).toEqual([MANAGER_EVENT]);
    expect(await rows(unitId, ASSIGNEE_EVENT)).toBe(0);
  });

  describe('a change committed between the candidate list and the per-cabinet check', () => {
    /**
     * The change is started first and waits for the cabinet row; the check then reads its
     * candidate list (the change is not committed yet, so the cabinet is still late) and waits
     * behind it for the same row. Both are released together.
     */
    const raceWith = (unitId: number, change: () => Promise<unknown>) =>
      queuedBehind(
        h.dataSource,
        UNIT_LOCK,
        [unitId],
        [change, () => overdue.run(NEXT_DAY)],
      );

    it('raises nothing for a cabinet whose finishing was done meanwhile', async () => {
      const { unitId } = await lateOrder();
      await runStages(
        h,
        unitId,
        PRODUCTION_STAGES.filter((s) => s !== ProductionStage.FINISHING),
        'techA',
      );
      await h
        .post(
          stagePath(unitId, ProductionStage.FINISHING, 'start'),
          {},
          'techA',
        )
        .expect(200);

      await raceWith(unitId, () =>
        h
          .post(
            stagePath(unitId, ProductionStage.FINISHING, 'finish'),
            {},
            'techA',
          )
          .expect(200),
      );

      expect(await overdueNotices('manager', unitId)).toEqual([]);
      expect(await overdueNotices('techA', unitId)).toEqual([]);
    });

    it('raises nothing for a cabinet re-planned to a later date meanwhile', async () => {
      const { id, unitId } = await lateOrder();

      await raceWith(unitId, () =>
        h.assign(id, unitId, { plannedEndDate: LATER }).expect(200),
      );

      expect(await overdueNotices('manager', unitId)).toEqual([]);
      expect(await overdueNotices('techA', unitId)).toEqual([]);
    });

    it('raises nothing for a cabinet whose production order was cancelled meanwhile', async () => {
      const { id, unitId } = await lateOrder();

      await raceWith(unitId, () =>
        h
          .post(`/production/orders/${id}/cancel`, { reason: 'customer left' })
          .expect(200),
      );

      expect(await overdueNotices('manager', unitId)).toEqual([]);
      expect(await overdueNotices('techA', unitId)).toEqual([]);
    });

    it('tells the new assignee only when the cabinet was reassigned meanwhile', async () => {
      const { id, unitId } = await lateOrder();

      await raceWith(unitId, () =>
        h.assign(id, unitId, { assigneeId: h.actors.techB.userId }).expect(200),
      );

      expect(await overdueNotices('techA', unitId)).toEqual([]);
      expect(await overdueNotices('techB', unitId)).toEqual([ASSIGNEE_EVENT]);
      expect(await overdueNotices('manager', unitId)).toEqual([MANAGER_EVENT]);
    });
  });

  it('survives two passes at once with one notice per audience', async () => {
    const { unitId } = await lateOrder();

    await Promise.all([overdue.run(NEXT_DAY), overdue.run(NEXT_DAY)]);

    expect(await rows(unitId, MANAGER_EVENT)).toBe(1);
    expect(await rows(unitId, ASSIGNEE_EVENT)).toBe(1);
  });
});
