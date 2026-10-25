import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { ItemService } from '@plugins/catalog/item/services/item.service';
import {
  buildEstimateFixture,
  type EstimateFixture,
} from '@plugins/sales/estimate/estimate-fixture.helper-spec';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';
import {
  ENGINEER_A,
  ENGINEER_B,
  LEAD,
  MANAGER,
  SALES_A,
  SALES_B,
} from '@plugins/sales/request/request-fixture.helper-spec';

import type { EstimateRevisionView } from '@plugins/sales/estimate/utils/estimate-revision.util';

const DIRECTOR = { userId: 50, role: 'director' };
const ADMIN = { userId: 1, role: 'admin', permissions: ['*:*'] };

/** The catalog's own item service on the fixture's item table and delete checks. */
const itemServiceOf = (fixture: EstimateFixture) =>
  new ItemService(fixture.items as never, fixture.registry);

/** An assigned request and its first draft, started by engineer A. */
async function startEstimate(fixture: EstimateFixture) {
  const request = fixture.requestAt(RequestStatus.ASSIGNED);
  const estimate = await fixture.service.create(
    { requestId: request.id },
    ENGINEER_A,
  );
  return { request, estimate };
}

/** The two-panel fixture of the totals spec, entered through the services. */
async function enterFixtureBom(fixture: EstimateFixture, estimateId: number) {
  const cable = fixture.itemOf({ name: 'Cable 3x4', unit: 'm' });
  const mccb = fixture.itemOf({ name: 'MCCB 3P', referencePrice: 1250000.5 });
  const gland = fixture.itemOf({ name: 'Gland' });
  const busbar = fixture.itemOf({ name: 'Busbar', unit: 'm' });
  const relay = fixture.itemOf({ name: 'Relay' });
  const { editor } = fixture;

  let view = await editor.addPanel(
    estimateId,
    { tag: 'MSB-01', quantity: 2 },
    ENGINEER_A,
  );
  const a = view.panels[0].id;
  view = await editor.addPanel(
    estimateId,
    { tag: 'MSB-02', description: 'Sub board', quantity: 1 },
    ENGINEER_A,
  );
  const b = view.panels[1].id;

  await editor.addBomLine(
    estimateId,
    a,
    { itemId: cable.id, quantity: 12.5, unitCost: 24500 },
    ENGINEER_A,
  );
  // No unit cost: the item's reference price is used.
  await editor.addBomLine(
    estimateId,
    a,
    { itemId: mccb.id, quantity: 3 },
    ENGINEER_A,
  );
  await editor.addBomLine(
    estimateId,
    a,
    { itemId: gland.id, quantity: 1.005, unitCost: 100 },
    ENGINEER_A,
  );
  await editor.addCostLine(
    estimateId,
    a,
    { category: 'design' as never, amount: 500000 },
    ENGINEER_A,
  );
  await editor.addCostLine(
    estimateId,
    a,
    { category: 'labor' as never, amount: 1200000 },
    ENGINEER_A,
  );
  await editor.addBomLine(
    estimateId,
    b,
    { itemId: busbar.id, quantity: 7.25, unitCost: 80000 },
    ENGINEER_A,
  );
  await editor.addBomLine(
    estimateId,
    b,
    { itemId: relay.id, quantity: 2, unitCost: 15500.75 },
    ENGINEER_A,
  );
  await editor.addCostLine(
    estimateId,
    b,
    { category: 'installation' as never, amount: 300000 },
    ENGINEER_A,
  );
  view = await editor.addCostLine(
    estimateId,
    b,
    { category: 'transport' as never, amount: 150000 },
    ENGINEER_A,
  );
  return { view, a, b, items: { cable, mccb, gland, busbar, relay } };
}

/** A submitted estimate with one panel and one line. */
async function submittedEstimate(fixture: EstimateFixture) {
  const { request, estimate } = await startEstimate(fixture);
  const item = fixture.itemOf({ referencePrice: 1000 });
  const view = await fixture.editor.addPanel(
    estimate.id,
    { tag: 'P-1', quantity: 1 },
    ENGINEER_A,
  );
  await fixture.editor.addBomLine(
    estimate.id,
    view.panels[0].id,
    { itemId: item.id, quantity: 2 },
    ENGINEER_A,
  );
  await fixture.service.submit(estimate.id, ENGINEER_A);
  return { request, estimate, item, panelId: view.panels[0].id };
}

describe('EstimateService', () => {
  describe('create', () => {
    it('makes the first draft DT_YYYY_0001 and moves the request assigned → estimating', async () => {
      const fixture = buildEstimateFixture();
      const request = fixture.requestAt(RequestStatus.ASSIGNED);

      const estimate = await fixture.service.create(
        { requestId: request.id },
        ENGINEER_A,
      );

      expect(estimate).toMatchObject({
        code: expect.stringMatching(/^DT_\d{4}_0001$/) as string,
        requestId: request.id,
        status: 'draft',
        latestRevision: 1,
        total: 0,
        request: {
          code: request.code,
          assignedEngineerName: 'Engineer A',
          salesOwnerName: 'Sales A',
        },
        revisions: [{ revision: 1, status: 'draft', total: 0 }],
        current: { revision: 1, status: 'draft', panels: [] },
      });
      expect(request.status).toBe(RequestStatus.ESTIMATING);
      expect(fixture.activities.rows.map((row) => row.action)).toEqual([
        'status_changed',
        'estimate_created',
      ]);
    });

    it('numbers the next estimate DT_YYYY_0002', async () => {
      const fixture = buildEstimateFixture();
      await startEstimate(fixture);
      const second = await startEstimate(fixture);

      expect(second.estimate.code.endsWith('_0002')).toBe(true);
    });

    it('answers 409 to a second estimate for the same request', async () => {
      const fixture = buildEstimateFixture();
      const { request } = await startEstimate(fixture);

      await expect(
        fixture.service.create({ requestId: request.id }, ENGINEER_A),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fixture.estimates.rows).toHaveLength(1);
    });

    it.each([
      RequestStatus.DRAFT,
      RequestStatus.ESTIMATED,
      RequestStatus.QUOTED,
      RequestStatus.CANCELLED,
    ])(
      'answers 409 for a request that is %s, and changes nothing',
      async (status) => {
        const fixture = buildEstimateFixture();
        const request = fixture.requestAt(status);

        await expect(
          fixture.service.create({ requestId: request.id }, LEAD),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(request.status).toBe(status);
        expect(fixture.estimates.rows).toHaveLength(0);
        expect(fixture.revisions.rows).toHaveLength(0);
      },
    );

    it('lets only the assigned engineer or the engineering lead start it; anyone else, director and admin included, gets 404', async () => {
      const fixture = buildEstimateFixture();
      const request = fixture.requestAt(RequestStatus.ASSIGNED);

      for (const actor of [
        ENGINEER_B,
        SALES_A,
        SALES_B,
        MANAGER,
        DIRECTOR,
        ADMIN,
      ]) {
        await expect(
          fixture.service.create({ requestId: request.id }, actor),
        ).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(request.status).toBe(RequestStatus.ASSIGNED);

      await expect(
        fixture.service.create({ requestId: request.id }, LEAD),
      ).resolves.toMatchObject({ status: 'draft' });
      // The failed attempts rolled back, so the table holds fresh copies of its rows.
      expect(fixture.requests.rows[0].status).toBe(RequestStatus.ESTIMATING);
    });

    it('answers 404 for an unknown or deleted request', async () => {
      const fixture = buildEstimateFixture();
      const gone = fixture.requestAt(RequestStatus.ASSIGNED, {
        isDeleted: true,
      });

      await expect(
        fixture.service.create({ requestId: 999 }, LEAD),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.service.create({ requestId: gone.id }, LEAD),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('totals and editing', () => {
    it('stores the server-computed totals of the two-panel fixture', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);

      const { view } = await enterFixtureBom(fixture, estimate.id);

      expect(view.total).toBe(12573708);
      expect(view.panels[0]).toMatchObject({
        tag: 'MSB-01',
        quantity: 2,
        unitCost: 5756353,
        total: 11512706,
      });
      expect(view.panels[0].bomLines.map((line) => line.amount)).toEqual([
        306250, 3750002, 101,
      ]);
      expect(view.panels[1]).toMatchObject({
        unitCost: 1061002,
        total: 1061002,
      });
      const reread = await fixture.service.findOne(estimate.id, ENGINEER_A);
      expect(reread.total).toBe(12573708);
      expect(reread.current.total).toBe(12573708);
    });

    it('defaults the unit cost to the item reference price, and to 0 without one', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);
      const priced = fixture.itemOf({ referencePrice: 1250.5 });
      const unpriced = fixture.itemOf();
      const view = await fixture.editor.addPanel(
        estimate.id,
        { tag: 'P', quantity: 1 },
        ENGINEER_A,
      );

      await fixture.editor.addBomLine(
        estimate.id,
        view.panels[0].id,
        { itemId: priced.id, quantity: 2 },
        ENGINEER_A,
      );
      const after = await fixture.editor.addBomLine(
        estimate.id,
        view.panels[0].id,
        { itemId: unpriced.id, quantity: 1 },
        ENGINEER_A,
      );

      expect(
        after.panels[0].bomLines.map((line) => [line.unitCost, line.amount]),
      ).toEqual([
        [1250.5, 2501],
        [0, 0],
      ]);
    });

    it('recomputes when a line changes or goes, and when the panel quantity changes', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);
      const { a, view } = await enterFixtureBom(fixture, estimate.id);
      const lineId = view.panels[0].bomLines[0].id;
      const costId = view.panels[0].costLines[0].id;

      let next = await fixture.editor.updateBomLine(
        estimate.id,
        lineId,
        { quantity: 10 },
        ENGINEER_A,
      );
      // 10 × 24,500 = 245,000 instead of 306,250.
      expect(next.panels[0].bomLines[0].amount).toBe(245000);

      next = await fixture.editor.updatePanel(
        estimate.id,
        a,
        { quantity: 3 },
        ENGINEER_A,
      );
      expect(next.panels[0].total).toBe(next.panels[0].unitCost * 3);

      next = await fixture.editor.deleteCostLine(
        estimate.id,
        costId,
        ENGINEER_A,
      );
      expect(next.panels[0].costLines).toHaveLength(1);
      const remaining = next.panels[0].bomLines.reduce(
        (sum, line) => sum + line.amount,
        0,
      );
      expect(next.panels[0].unitCost).toBe(remaining + 1200000);

      next = await fixture.editor.deletePanel(estimate.id, a, ENGINEER_A);
      expect(next.panels).toHaveLength(1);
      expect(next.total).toBe(1061002);
      expect(
        fixture.bomLines.rows.filter((row) => row.panelId === a),
      ).toHaveLength(0);
      expect(
        fixture.costLines.rows.filter((row) => row.panelId === a),
      ).toHaveLength(0);
    });

    it('keeps the snapshot of the item when the catalog item is renamed', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);
      const item = fixture.itemOf({
        code: 'LC1D09M7',
        name: 'Contactor 9A',
        brand: 'Schneider',
        unit: 'Cái',
        referencePrice: 500,
      });
      const view = await fixture.editor.addPanel(
        estimate.id,
        { tag: 'P', quantity: 1 },
        ENGINEER_A,
      );
      await fixture.editor.addBomLine(
        estimate.id,
        view.panels[0].id,
        { itemId: item.id, quantity: 1 },
        ENGINEER_A,
      );

      await itemServiceOf(fixture).update(
        item.id,
        { name: 'Renamed contactor', brand: 'Other', referencePrice: 900 },
        { userId: 40, role: 'purchasing' },
      );

      const line = (await fixture.service.findOne(estimate.id, ENGINEER_A))
        .current.panels[0].bomLines[0];
      expect(line).toMatchObject({
        itemId: item.id,
        itemCode: 'LC1D09M7',
        itemName: 'Contactor 9A',
        itemBrand: 'Schneider',
        itemUnit: 'Cái',
        unitCost: 500,
      });
    });

    it('rejects an unknown or deleted item with 404', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);
      const gone = fixture.itemOf({ isDeleted: true, deletedAt: new Date() });
      const view = await fixture.editor.addPanel(
        estimate.id,
        { tag: 'P', quantity: 1 },
        ENGINEER_A,
      );
      const panelId = view.panels[0].id;

      for (const itemId of [999, gone.id]) {
        await expect(
          fixture.editor.addBomLine(
            estimate.id,
            panelId,
            { itemId, quantity: 1 },
            ENGINEER_A,
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(fixture.bomLines.rows).toHaveLength(0);
    });

    it('answers 409 to a duplicate panel tag in any case, and 404 to a panel or line of another estimate', async () => {
      const fixture = buildEstimateFixture();
      const first = await startEstimate(fixture);
      const second = await startEstimate(fixture);
      const view = await fixture.editor.addPanel(
        first.estimate.id,
        { tag: 'MSB-01', quantity: 1 },
        ENGINEER_A,
      );
      const foreign = await fixture.editor.addPanel(
        second.estimate.id,
        { tag: 'MSB-01', quantity: 1 },
        ENGINEER_A,
      );

      await expect(
        fixture.editor.addPanel(
          first.estimate.id,
          { tag: ' msb-01 ', quantity: 1 },
          ENGINEER_A,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        fixture.editor.updatePanel(
          first.estimate.id,
          foreign.panels[0].id,
          { quantity: 5 },
          ENGINEER_A,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.editor.addCostLine(
          first.estimate.id,
          foreign.panels[0].id,
          { category: 'labor' as never, amount: 1 },
          ENGINEER_A,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      const item = fixture.itemOf();
      const line = await fixture.editor.addBomLine(
        second.estimate.id,
        foreign.panels[0].id,
        { itemId: item.id, quantity: 1 },
        ENGINEER_A,
      );
      await expect(
        fixture.editor.updateBomLine(
          first.estimate.id,
          line.panels[0].bomLines[0].id,
          { quantity: 9 },
          ENGINEER_A,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(view.panels).toHaveLength(1);
    });

    it('rejects a total beyond the amount cap with 400 and stores nothing', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);
      const item = fixture.itemOf();
      const view = await fixture.editor.addPanel(
        estimate.id,
        { tag: 'P', quantity: 10000 },
        ENGINEER_A,
      );

      await expect(
        fixture.editor.addBomLine(
          estimate.id,
          view.panels[0].id,
          {
            itemId: item.id,
            quantity: 1000000,
            unitCost: 10000000000,
          },
          ENGINEER_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.bomLines.rows).toHaveLength(0);
    });
  });

  describe('who may write', () => {
    it('answers 404 to the director and the administrator on every write, though both read the estimate', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);
      const item = fixture.itemOf();
      const view = await fixture.editor.addPanel(
        estimate.id,
        { tag: 'P', quantity: 1 },
        ENGINEER_A,
      );
      const panelId = view.panels[0].id;

      for (const actor of [DIRECTOR, ADMIN]) {
        await expect(
          fixture.service.findOne(estimate.id, actor),
        ).resolves.toMatchObject({ id: estimate.id });
        await expect(
          fixture.editor.addPanel(
            estimate.id,
            { tag: 'Q', quantity: 1 },
            actor,
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          fixture.editor.addBomLine(
            estimate.id,
            panelId,
            { itemId: item.id, quantity: 1 },
            actor,
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          fixture.service.submit(estimate.id, actor),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          fixture.service.revise(estimate.id, actor),
        ).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(fixture.bomLines.rows).toHaveLength(0);
    });

    it('lets the engineering lead edit, submit and revise an estimate assigned to someone else', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);
      const item = fixture.itemOf({ referencePrice: 10 });
      const view = await fixture.editor.addPanel(
        estimate.id,
        { tag: 'P', quantity: 1 },
        LEAD,
      );
      await fixture.editor.addBomLine(
        estimate.id,
        view.panels[0].id,
        { itemId: item.id, quantity: 1 },
        LEAD,
      );

      await expect(
        fixture.service.submit(estimate.id, LEAD),
      ).resolves.toMatchObject({ status: 'submitted' });
      await expect(
        fixture.service.revise(estimate.id, LEAD),
      ).resolves.toMatchObject({ latestRevision: 2 });
    });

    it('answers 404 to engineer B editing engineer A’s estimate, and changes nothing', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);

      await expect(
        fixture.editor.addPanel(
          estimate.id,
          { tag: 'P', quantity: 1 },
          ENGINEER_B,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.service.submit(estimate.id, ENGINEER_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.service.revise(estimate.id, ENGINEER_B),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fixture.panels.rows).toHaveLength(0);
    });

    it('answers 404 to a sales owner or a manager holding no write scope, and lets the lead edit any estimate', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);

      // A Sales actor reads own records only; their write attempt is outside their scope too.
      await expect(
        fixture.editor.addPanel(
          estimate.id,
          { tag: 'P', quantity: 1 },
          SALES_B,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.editor.addPanel(
          estimate.id,
          { tag: 'P', quantity: 1 },
          SALES_A,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(
        fixture.editor.addPanel(estimate.id, { tag: 'P', quantity: 1 }, LEAD),
      ).resolves.toMatchObject({ panels: [{ tag: 'P' }] });
    });

    it('answers 404 for an unknown estimate', async () => {
      const fixture = buildEstimateFixture();

      await expect(
        fixture.editor.addPanel(99, { tag: 'P', quantity: 1 }, LEAD),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to write once the request is cancelled', async () => {
      const fixture = buildEstimateFixture();
      const { request, estimate } = await startEstimate(fixture);
      await fixture.statusPort.advance(
        fixture.manager as never,
        request.id,
        RequestStatus.CANCELLED,
      );

      await expect(
        fixture.editor.addPanel(
          estimate.id,
          { tag: 'P', quantity: 1 },
          ENGINEER_A,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('read scope', () => {
    it('shows an estimate to its sales owner, assigned engineer, manager and lead, and 404 to others', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);

      for (const actor of [SALES_A, ENGINEER_A, MANAGER, LEAD]) {
        await expect(
          fixture.service.findOne(estimate.id, actor),
        ).resolves.toMatchObject({ id: estimate.id });
      }
      for (const actor of [SALES_B, ENGINEER_B]) {
        await expect(
          fixture.service.findOne(estimate.id, actor),
        ).rejects.toBeInstanceOf(NotFoundException);
      }
    });

    it('lists only the estimates of the requests the actor can read, with the toolbar filters', async () => {
      const fixture = buildEstimateFixture();
      const one = await startEstimate(fixture);
      const otherRequest = fixture.requestAt(RequestStatus.ASSIGNED, {
        salesOwnerId: 12,
        assignedEngineerId: ENGINEER_B.userId,
      });
      const two = await fixture.service.create(
        { requestId: otherRequest.id },
        ENGINEER_B,
      );
      const ids = async (
        actor: typeof SALES_A,
        query: Record<string, unknown> = {},
      ) =>
        (await fixture.service.findAll(query as never, actor)).data
          .map((row) => row.id)
          .sort();

      expect(await ids(SALES_A)).toEqual([one.estimate.id]);
      expect(await ids(SALES_B)).toEqual([two.id]);
      expect(await ids(ENGINEER_A)).toEqual([one.estimate.id]);
      expect(await ids(ENGINEER_B)).toEqual([two.id]);
      expect(await ids(MANAGER)).toEqual([one.estimate.id, two.id].sort());
      expect(
        await ids(LEAD, { assignedEngineerId: ENGINEER_B.userId }),
      ).toEqual([two.id]);
      expect(await ids(LEAD, { requestId: one.request.id })).toEqual([
        one.estimate.id,
      ]);
      // An engineer asking for another engineer's work matches nothing.
      expect(
        await ids(ENGINEER_A, { assignedEngineerId: ENGINEER_B.userId }),
      ).toEqual([]);
      expect(await ids(LEAD, { status: 'submitted' })).toEqual([]);
      expect(await ids(LEAD, { status: 'draft' })).toEqual(
        [one.estimate.id, two.id].sort(),
      );
    });

    it('rows of the list carry the request, customer and engineer names', async () => {
      const fixture = buildEstimateFixture();
      const { request } = await startEstimate(fixture);

      const { data } = await fixture.service.findAll({}, LEAD);

      expect(data[0].request).toMatchObject({
        code: request.code,
        customerName: 'Customer 1',
        assignedEngineerName: 'Engineer A',
        salesOwnerName: 'Sales A',
      });
    });

    it('answers 404 for a revision that does not exist', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);

      await expect(
        fixture.service.findOne(estimate.id, LEAD, 7),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('submit', () => {
    it('sets the request estimated, freezes the revision and notifies the sales owner once', async () => {
      const fixture = buildEstimateFixture();
      const { request, estimate } = await startEstimate(fixture);
      await enterFixtureBom(fixture, estimate.id);

      const submitted = await fixture.service.submit(estimate.id, ENGINEER_A);

      expect(request.status).toBe(RequestStatus.ESTIMATED);
      expect(submitted).toMatchObject({
        status: 'submitted',
        total: 12573708,
        current: {
          status: 'submitted',
          submittedBy: ENGINEER_A.userId,
          total: 12573708,
        },
      });
      expect(submitted.current.submittedAt).toBeInstanceOf(Date);
      expect(fixture.notifications.emit).toHaveBeenCalledTimes(1);
      expect(fixture.notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'sales.estimate.submitted',
          userIds: [SALES_A.userId],
          roleCodes: [],
          requiredScope: 'estimate:read',
          link: `/sales/estimates/${estimate.id}`,
          message: `${estimate.code} — ${request.code}`,
          payload: expect.objectContaining({
            code: estimate.code,
            requestCode: request.code,
            revision: 1,
          }) as object,
        }),
      );
      expect(fixture.activities.rows.map((row) => row.action)).toContain(
        'estimate_submitted',
      );
    });

    it('answers 409 to a second submit and does not notify again', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await submittedEstimate(fixture);

      await expect(
        fixture.service.submit(estimate.id, ENGINEER_A),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fixture.notifications.emit).toHaveBeenCalledTimes(1);
    });

    it('needs a panel, and a BOM line in every panel (400), leaving the draft as it was', async () => {
      const fixture = buildEstimateFixture();
      const { request, estimate } = await startEstimate(fixture);

      await expect(
        fixture.service.submit(estimate.id, ENGINEER_A),
      ).rejects.toBeInstanceOf(BadRequestException);
      await fixture.editor.addPanel(
        estimate.id,
        { tag: 'P', quantity: 1 },
        ENGINEER_A,
      );
      await expect(
        fixture.service.submit(estimate.id, ENGINEER_A),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(request.status).toBe(RequestStatus.ESTIMATING);
      expect(fixture.revisions.rows[0].status).toBe('draft');
      expect(fixture.notifications.emit).not.toHaveBeenCalled();
    });

    it('rolls everything back and notifies nobody when the transaction fails', async () => {
      const fixture = buildEstimateFixture();
      const { request, estimate } = await startEstimate(fixture);
      await enterFixtureBom(fixture, estimate.id);
      jest
        .spyOn(fixture.statusPort, 'advance')
        .mockRejectedValueOnce(new Error('connection lost'));

      await expect(
        fixture.service.submit(estimate.id, ENGINEER_A),
      ).rejects.toThrow('connection lost');

      expect(request.status).toBe(RequestStatus.ESTIMATING);
      expect(fixture.revisions.rows[0].status).toBe('draft');
      expect(fixture.revisions.rows[0].submittedAt ?? null).toBeNull();
      expect(fixture.estimates.rows[0].status).toBe('draft');
      expect(fixture.notifications.emit).not.toHaveBeenCalled();
    });

    it('does not undo the submission when the notice cannot be sent', async () => {
      const fixture = buildEstimateFixture();
      const { request, estimate } = await startEstimate(fixture);
      await enterFixtureBom(fixture, estimate.id);
      fixture.notifications.emit.mockRejectedValueOnce(new Error('queue down'));
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(
        fixture.service.submit(estimate.id, ENGINEER_A),
      ).resolves.toMatchObject({ status: 'submitted' });
      expect(request.status).toBe(RequestStatus.ESTIMATED);
    });

    it('answers 409 when the request is quoted, and stays a draft', async () => {
      const fixture = buildEstimateFixture();
      const { request, estimate } = await startEstimate(fixture);
      await enterFixtureBom(fixture, estimate.id);
      request.status = RequestStatus.QUOTED;

      await expect(
        fixture.service.submit(estimate.id, ENGINEER_A),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fixture.revisions.rows[0].status).toBe('draft');
    });
  });

  describe('read-only after submit', () => {
    it('answers 409 to every edit of a submitted revision', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, panelId, item } = await submittedEstimate(fixture);
      const view = (await fixture.service.findOne(estimate.id, ENGINEER_A))
        .current;
      const lineId = view.panels[0].bomLines[0].id;
      const { editor } = fixture;
      const before = JSON.stringify(view);

      const attempts: Array<Promise<EstimateRevisionView>> = [
        editor.addPanel(estimate.id, { tag: 'X', quantity: 1 }, ENGINEER_A),
        editor.updatePanel(estimate.id, panelId, { quantity: 9 }, ENGINEER_A),
        editor.deletePanel(estimate.id, panelId, ENGINEER_A),
        editor.addBomLine(
          estimate.id,
          panelId,
          { itemId: item.id, quantity: 1 },
          ENGINEER_A,
        ),
        editor.updateBomLine(estimate.id, lineId, { quantity: 9 }, ENGINEER_A),
        editor.deleteBomLine(estimate.id, lineId, ENGINEER_A),
        editor.addCostLine(
          estimate.id,
          panelId,
          { category: 'labor' as never, amount: 1 },
          ENGINEER_A,
        ),
        editor.updateCostLine(estimate.id, 1, { amount: 2 }, ENGINEER_A),
        editor.deleteCostLine(estimate.id, 1, ENGINEER_A),
      ];
      for (const attempt of attempts) {
        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      }

      const after = (await fixture.service.findOne(estimate.id, ENGINEER_A))
        .current;
      expect(JSON.stringify(after)).toBe(before);
    });
  });

  describe('revise', () => {
    it('opens draft revision 2 as a copy with its snapshots; revision 1 stays the submitted one', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, item } = await submittedEstimate(fixture);

      const revised = await fixture.service.revise(estimate.id, ENGINEER_A);

      expect(revised).toMatchObject({
        status: 'draft',
        latestRevision: 2,
        revisions: [
          { revision: 1, status: 'submitted' },
          { revision: 2, status: 'draft' },
        ],
        current: {
          revision: 2,
          status: 'draft',
          panels: [
            {
              tag: 'P-1',
              bomLines: [
                {
                  itemId: item.id,
                  itemCode: item.code,
                  itemName: item.name,
                  quantity: 2,
                  unitCost: 1000,
                  amount: 2000,
                },
              ],
            },
          ],
        },
      });
      // The copy has its own rows: editing it leaves revision 1 as submitted.
      const edited = await fixture.editor.updatePanel(
        estimate.id,
        revised.current.panels[0].id,
        { quantity: 4 },
        ENGINEER_A,
      );
      expect(edited.total).toBe(8000);
      const first = await fixture.service.findOne(estimate.id, ENGINEER_A, 1);
      expect(first.current).toMatchObject({ status: 'submitted', total: 2000 });
      expect(first.current.panels[0].quantity).toBe(1);
      expect(fixture.panels.rows).toHaveLength(2);
    });

    it('supersedes the previous revision only when the new draft is submitted', async () => {
      const fixture = buildEstimateFixture();
      const { request, estimate } = await submittedEstimate(fixture);
      await fixture.service.revise(estimate.id, ENGINEER_A);
      expect(
        fixture.revisions.rows.map((row) => [row.revision, row.status]),
      ).toEqual([
        [1, 'submitted'],
        [2, 'draft'],
      ]);

      await fixture.service.submit(estimate.id, ENGINEER_A);

      expect(
        fixture.revisions.rows.map((row) => [row.revision, row.status]),
      ).toEqual([
        [1, 'superseded'],
        [2, 'submitted'],
      ]);
      expect(request.status).toBe(RequestStatus.ESTIMATED);
      expect(fixture.notifications.emit).toHaveBeenCalledTimes(2);
      expect(fixture.notifications.emit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ revision: 2 }) as object,
        }),
      );
      // A superseded revision cannot be revised again: only the latest can.
      await expect(
        fixture.service.revise(estimate.id, ENGINEER_A),
      ).resolves.toMatchObject({ latestRevision: 3 });
    });

    it('answers 409 while a draft is open', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);

      await expect(
        fixture.service.revise(estimate.id, ENGINEER_A),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fixture.revisions.rows).toHaveLength(1);
    });

    it.each([
      RequestStatus.QUOTED,
      RequestStatus.WON,
      RequestStatus.LOST,
      RequestStatus.CANCELLED,
    ])('answers 409 once the request is %s', async (status) => {
      const fixture = buildEstimateFixture();
      const { request, estimate } = await submittedEstimate(fixture);
      request.status = status;

      await expect(
        fixture.service.revise(estimate.id, LEAD),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fixture.revisions.rows).toHaveLength(1);
      expect(fixture.estimates.rows[0].status).toBe('submitted');
    });

    it('lets the lead revise any estimate', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await submittedEstimate(fixture);

      await expect(
        fixture.service.revise(estimate.id, LEAD),
      ).resolves.toMatchObject({ latestRevision: 2 });
    });
  });

  describe('panel tag race', () => {
    it('answers 409, not 500, when the tag index refuses a concurrent insert', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);
      fixture.panels.save.mockRejectedValueOnce(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('duplicate key value'), {
            code: '23505',
            constraint: 'uq_sales_estimate_panels_tag',
          }),
        ),
      );

      await expect(
        fixture.editor.addPanel(
          estimate.id,
          { tag: 'MSB-01', quantity: 1 },
          ENGINEER_A,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('whole-VND cost lines', () => {
    it('stores and sums an integer amount exactly', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);
      const view = await fixture.editor.addPanel(
        estimate.id,
        { tag: 'P', quantity: 3 },
        ENGINEER_A,
      );

      const next = await fixture.editor.addCostLine(
        estimate.id,
        view.panels[0].id,
        { category: 'labor' as never, amount: 1000 },
        ENGINEER_A,
      );

      expect(next.panels[0].costLines[0].amount).toBe(1000);
      expect(next.panels[0]).toMatchObject({ unitCost: 1000, total: 3000 });
    });
  });

  describe('item reference check', () => {
    it('refuses to delete an item used in a BOM line (409), also in a bulk delete', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await startEstimate(fixture);
      const used = fixture.itemOf();
      const free = fixture.itemOf();
      const view = await fixture.editor.addPanel(
        estimate.id,
        { tag: 'P', quantity: 1 },
        ENGINEER_A,
      );
      await fixture.editor.addBomLine(
        estimate.id,
        view.panels[0].id,
        { itemId: used.id, quantity: 1 },
        ENGINEER_A,
      );
      const purchasing = { userId: 40, role: 'purchasing' };

      await expect(
        itemServiceOf(fixture).remove(used.id, purchasing),
      ).rejects.toBeInstanceOf(ConflictException);
      const result = await itemServiceOf(fixture).removeMany(
        [used.id, free.id],
        purchasing,
      );

      expect(result.deleted).toEqual([free.id]);
      expect(result.failed).toHaveLength(1);
      expect(
        fixture.items.rows.find((row) => row.id === used.id)?.deletedAt,
      ).toBeUndefined();
    });

    it('registers the check once under the name estimate', () => {
      const fixture = buildEstimateFixture();

      expect(() => fixture.service.onModuleInit()).toThrow(
        /already registered/,
      );
    });
  });
});
