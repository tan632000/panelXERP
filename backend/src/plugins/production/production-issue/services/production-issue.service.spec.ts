import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';
import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import { ProductionStage } from '@plugins/production/production-order/enums/production-stage.enum';
import {
  describeWithDatabase,
  type ActorName,
} from '@plugins/production/production-order/production-db.helper-spec';
import {
  releasedOrder,
  runStages,
} from '@plugins/production/progress/progress-db.helper-spec';
import {
  openPhotoHarness,
  type PhotoHarness,
} from '@plugins/production/progress/unit-photo-db.helper-spec';

import type { Response } from 'supertest';

interface IssueBody {
  id: number;
  unitId: number;
  stage: string;
  status: string;
  severity: string;
  reportedBy: number;
  resolvedBy: number | null;
  resolution: string | null;
}
interface PageBody {
  data: IssueBody[];
  meta: { total: number };
}

const HEADER_LOCK = `SELECT id FROM production_orders WHERE id = $1 FOR UPDATE`;
const statusOf = (result: PromiseSettledResult<Response>) =>
  result.status === 'fulfilled' ? result.value.status : 'rejected';

/**
 * Production issues over HTTP against the real Postgres of the compose stack: who may open and
 * resolve, the scope of every read, that an open issue blocks no stage, and the notice each
 * decision sends to its audience, read through that actor's notification list.
 */
describeWithDatabase('Production issues (real Postgres)', () => {
  jest.setTimeout(90_000);

  let p: PhotoHarness;

  beforeAll(async () => {
    p = await openPhotoHarness();
  });

  afterAll(async () => {
    await p?.h.close();
  });

  const NEW_ISSUE = {
    stage: 'wiring',
    description: 'Terminal block missing',
    severity: 'high',
  };

  const open = (
    unitId: number,
    as: ActorName = 'techA',
    body: object = NEW_ISSUE,
  ) => p.h.post(`/production/units/${unitId}/issues`, body, as);

  const resolve = (
    id: number,
    as: ActorName = 'manager',
    resolution = 'Fitted',
  ) => p.h.post(`/production/issues/${id}/resolve`, { resolution }, as);

  const cabinet = async (quantity = 1) => {
    const order = await releasedOrder(p.h, quantity);
    return { ...order, unitId: order.units[0].id };
  };

  const noticesOf = async (as: ActorName, orderId: number, event: string) =>
    (await p.h.notices(as, orderId)).filter(
      (notice) => notice.eventType === event,
    );

  const issueEventsOf = async (productionOrderId: number) => {
    const rows: Array<Record<string, unknown>> = await p.h.dataSource.query(
      `SELECT event, unit_code AS "unitCode", actor_id AS "actorId", reason
         FROM production_order_events
        WHERE production_order_id = $1 AND event::text LIKE 'issue_%'
        ORDER BY id`,
      [productionOrderId],
    );
    return rows;
  };

  describe('opening', () => {
    it('opens an issue for the assigned technician and tells the production managers', async () => {
      const { id, orderId, unitId } = await cabinet();

      const res = await open(unitId).expect(201);

      expect(res.body).toMatchObject({
        unitId,
        stage: 'wiring',
        status: 'open',
        severity: 'high',
        description: 'Terminal block missing',
        reportedBy: p.h.actors.techA.userId,
        resolvedBy: null,
      });
      expectNoMoneyKeys(res.body);
      const seen = await noticesOf(
        'manager',
        orderId,
        'production.issue.opened',
      );
      expect(seen).toHaveLength(1);
      expect(seen[0].payload).toMatchObject({
        issueId: (res.body as IssueBody).id,
        unitId,
        severity: 'high',
      });
      // The role record is not addressed to the technician.
      expect(
        await noticesOf('techA', orderId, 'production.issue.opened'),
      ).toHaveLength(0);
      expect(await issueEventsOf(id)).toEqual([
        {
          event: 'issue_reported',
          unitCode: expect.any(String) as unknown,
          actorId: p.h.actors.techA.userId,
          reason: 'wiring, high: Terminal block missing',
        },
      ]);
    });

    it('lets a production manager open an issue on any cabinet', async () => {
      const { unitId } = await cabinet();
      await open(unitId, 'manager').expect(201);
    });

    it('answers 404 to a technician who is not assigned and 403 to a role without create', async () => {
      const { unitId } = await cabinet();

      await open(unitId, 'techB').expect(404);
      await open(unitId, 'director').expect(403);
      await open(unitId, 'salesA').expect(403);
    });

    it.each([
      ['an empty description', { ...NEW_ISSUE, description: '  ' }],
      [
        'a description over 2000 characters',
        { ...NEW_ISSUE, description: 'x'.repeat(2001) },
      ],
      ['an unknown severity', { ...NEW_ISSUE, severity: 'critical' }],
      ['an unknown stage', { ...NEW_ISSUE, stage: 'painting' }],
    ])('refuses %s (400)', async (_name, body) => {
      const { unitId } = await cabinet();
      await open(unitId, 'techA', body).expect(400);
    });

    it('takes a description of exactly 2000 characters', async () => {
      const { unitId } = await cabinet();
      await open(unitId, 'techA', {
        ...NEW_ISSUE,
        description: 'x'.repeat(2000),
      }).expect(201);
    });

    it('refuses an issue while the production order is not released (409)', async () => {
      const orderId = await p.h.newOrder({
        panels: [{ tag: 'MSB', quantity: 1 }],
      });
      const created = await p.h.createProduction(orderId).expect(201);
      const [unit] = await p.h.units((created.body as { id: number }).id);

      await open(unit.id, 'manager').expect(409);
    });
  });

  describe('a stage with an open issue', () => {
    it('still finishes (2xx): an open issue blocks nothing', async () => {
      const { unitId } = await cabinet();
      await open(unitId).expect(201);

      await runStages(p.h, unitId, [ProductionStage.MATERIAL_PREP]);

      const read = await p.h.get(`/production/units/${unitId}`, 'techA');
      expect(
        (read.body as { stages: Array<{ status: string }> }).stages[0].status,
      ).toBe('done');
    });
  });

  describe('resolving', () => {
    it('resolves with a resolution and tells the technician who reported it', async () => {
      const { id, orderId, unitId } = await cabinet();
      const issue = (await open(unitId).expect(201)).body as IssueBody;

      const res = await resolve(issue.id, 'manager', 'Block fitted').expect(
        200,
      );

      expect(res.body).toMatchObject({
        id: issue.id,
        status: 'resolved',
        resolution: 'Block fitted',
        resolvedBy: p.h.actors.manager.userId,
      });
      expectNoMoneyKeys(res.body);
      const told = await noticesOf(
        'techA',
        orderId,
        'production.issue.resolved',
      );
      expect(told).toHaveLength(1);
      expect(told[0].payload).toMatchObject({ issueId: issue.id });
      expect(
        await noticesOf('manager', orderId, 'production.issue.resolved'),
      ).toHaveLength(0);
      expect(
        (await issueEventsOf(id)).map((row) => [
          row.event,
          row.actorId,
          row.reason,
        ]),
      ).toEqual([
        ['issue_reported', p.h.actors.techA.userId, expect.any(String)],
        ['issue_resolved', p.h.actors.manager.userId, 'Block fitted'],
      ]);
    });

    it('answers 403 to a technician', async () => {
      const { unitId } = await cabinet();
      const issue = (await open(unitId).expect(201)).body as IssueBody;

      await resolve(issue.id, 'techA').expect(403);

      const read = await p.h.get(
        `/production/issues?unitId=${unitId}`,
        'manager',
      );
      expect((read.body as PageBody).data[0].status).toBe('open');
    });

    it('answers 409 the second time', async () => {
      const { unitId } = await cabinet();
      const issue = (await open(unitId).expect(201)).body as IssueBody;
      await resolve(issue.id).expect(200);

      await resolve(issue.id, 'manager', 'Again').expect(409);

      const read = await p.h.get(
        `/production/issues?unitId=${unitId}`,
        'manager',
      );
      expect((read.body as PageBody).data[0].resolution).toBe('Fitted');
    });

    it('resolves once and tells the reporter once when two resolves are queued behind the header', async () => {
      const { id, orderId, unitId } = await cabinet();
      const issue = (await open(unitId).expect(201)).body as IssueBody;

      const results = await queuedBehind<Response>(
        p.h.dataSource,
        HEADER_LOCK,
        [id],
        [
          () => resolve(issue.id, 'manager', 'First'),
          () => resolve(issue.id, 'manager', 'Second'),
        ],
      );

      expect(results.map(statusOf)).toEqual([200, 409]);
      expect(
        await noticesOf('techA', orderId, 'production.issue.resolved'),
      ).toHaveLength(1);
    });

    it.each([
      ['an empty resolution', ''],
      ['a resolution over 2000 characters', 'x'.repeat(2001)],
    ])('refuses %s (400)', async (_name, resolution) => {
      const { unitId } = await cabinet();
      const issue = (await open(unitId).expect(201)).body as IssueBody;
      await resolve(issue.id, 'manager', resolution).expect(400);
    });

    it('answers 404 for an issue that does not exist', async () => {
      await resolve(2000000000).expect(404);
    });

    it('resolves an issue of an order cancelled meanwhile', async () => {
      const { id, unitId } = await cabinet();
      const issue = (await open(unitId).expect(201)).body as IssueBody;
      await p.h
        .post(`/production/orders/${id}/cancel`, { reason: 'Customer left' })
        .expect(200);

      await resolve(issue.id).expect(200);
    });
  });

  describe('who reads the issues', () => {
    it('lists every issue for a manager, a director and a sales manager, filtered by status and order', async () => {
      const { id, unitId } = await cabinet();
      const first = (await open(unitId).expect(201)).body as IssueBody;
      const second = (await open(unitId).expect(201)).body as IssueBody;
      await resolve(first.id).expect(200);

      for (const actor of ['manager', 'director', 'salesMgr'] as const) {
        const res = await p.h
          .get(`/production/issues?productionOrderId=${id}&status=open`, actor)
          .expect(200);
        expect((res.body as PageBody).data.map((issue) => issue.id)).toEqual([
          second.id,
        ]);
        expectNoMoneyKeys(res.body);
      }
      const all = await p.h
        .get(`/production/issues?productionOrderId=${id}`, 'manager')
        .expect(200);
      expect((all.body as PageBody).meta.total).toBe(2);
    });

    it('shows a technician only the issues of their own cabinets, and nothing to another technician', async () => {
      const { id, unitId } = await cabinet();
      const issue = (await open(unitId).expect(201)).body as IssueBody;

      const own = await p.h
        .get(`/production/issues?productionOrderId=${id}`, 'techA')
        .expect(200);
      const other = await p.h
        .get(`/production/issues?productionOrderId=${id}`, 'techB')
        .expect(200);

      expect((own.body as PageBody).data.map((row) => row.id)).toEqual([
        issue.id,
      ]);
      expect((other.body as PageBody).data).toEqual([]);
    });

    it('answers 403 to sales, who hold no issue read', async () => {
      await p.h.get('/production/issues', 'salesA').expect(403);
    });
  });
});
