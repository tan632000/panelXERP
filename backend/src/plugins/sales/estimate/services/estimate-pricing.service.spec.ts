import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';
import { findMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import {
  buildEstimateFixture,
  PRICER_MANAGER,
  PRICER_SALES_A,
  PRICER_SALES_B,
  type EstimateFixture,
} from '@plugins/sales/estimate/estimate-fixture.helper-spec';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';
import { ENGINEER_A } from '@plugins/sales/request/request-fixture.helper-spec';

const DIRECTOR = {
  userId: 50,
  role: 'director',
  permissions: seededRolePermissions('director'),
};

/**
 * A request whose estimate the engineer submitted: one panel of 2, a priced item (3 × 1,000)
 * and an item with no reference price (1 × 0), so the revision is still unpriced.
 */
async function submittedEstimate(fixture: EstimateFixture, twoFree = false) {
  const request = fixture.requestAt(RequestStatus.ASSIGNED);
  const estimate = await fixture.service.create(
    { requestId: request.id },
    ENGINEER_A,
  );
  const priced = fixture.itemOf({ referencePrice: 1000 });
  const free = fixture.itemOf();
  const view = await fixture.editor.addPanel(
    estimate.id,
    { tag: 'MSB-01', quantity: 2 },
    ENGINEER_A,
  );
  const panelId = view.panels[0].id;
  await fixture.editor.addBomLine(
    estimate.id,
    panelId,
    { itemId: priced.id, quantity: 3 },
    ENGINEER_A,
  );
  await fixture.editor.addBomLine(
    estimate.id,
    panelId,
    { itemId: free.id, quantity: 1 },
    ENGINEER_A,
  );
  const second = twoFree ? fixture.itemOf() : undefined;
  if (second) {
    await fixture.editor.addBomLine(
      estimate.id,
      panelId,
      { itemId: second.id, quantity: 1 },
      ENGINEER_A,
    );
  }
  await fixture.service.submit(estimate.id, ENGINEER_A);
  const current = (await fixture.service.findOne(estimate.id, PRICER_SALES_A))
    .current;
  return {
    request,
    estimate,
    priced,
    free,
    second,
    panelId,
    pricedLineId: current.panels[0].bomLines[0].id,
    freeLineId: current.panels[0].bomLines[1].id,
  };
}

/** The same estimate, priced to the point where `complete` succeeds. */
async function readyToComplete(fixture: EstimateFixture) {
  const made = await submittedEstimate(fixture);
  await fixture.pricing.setUnitCost(
    made.estimate.id,
    made.freeLineId,
    { unitCost: 250 },
    PRICER_SALES_A,
  );
  return made;
}

const latest = (fixture: EstimateFixture) => fixture.revisions.rows.at(-1);

describe('EstimatePricingService', () => {
  describe('the engineer submits quantities only', () => {
    it('leaves the submitted revision unpriced', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await submittedEstimate(fixture);

      const detail = await fixture.service.findOne(estimate.id, PRICER_SALES_A);

      expect(detail.current).toMatchObject({
        status: 'submitted',
        pricedAt: null,
        pricedBy: null,
      });
      expect(detail.revisions[0]).toMatchObject({ pricedAt: null });
      expect(latest(fixture)?.pricedAt ?? null).toBeNull();
    });
  });

  describe('who may price', () => {
    it('answers 404 to a sales user who does not own the request, on every method, and changes nothing', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, panelId, pricedLineId } =
        await submittedEstimate(fixture);
      const before = JSON.stringify(fixture.bomLines.rows);

      const attempts = [
        () =>
          fixture.pricing.setUnitCost(
            estimate.id,
            pricedLineId,
            { unitCost: 1 },
            PRICER_SALES_B,
          ),
        () =>
          fixture.pricing.addCostLine(
            estimate.id,
            panelId,
            { category: 'labor' as never, amount: 5 },
            PRICER_SALES_B,
          ),
        () =>
          fixture.pricing.updateCostLine(
            estimate.id,
            1,
            { amount: 5 },
            PRICER_SALES_B,
          ),
        () => fixture.pricing.deleteCostLine(estimate.id, 1, PRICER_SALES_B),
        () => fixture.pricing.complete(estimate.id, PRICER_SALES_B),
      ];
      for (const attempt of attempts) {
        await expect(attempt()).rejects.toBeInstanceOf(NotFoundException);
      }

      expect(JSON.stringify(fixture.bomLines.rows)).toBe(before);
      expect(fixture.costLines.rows).toHaveLength(0);
      expect(latest(fixture)?.pricedAt ?? null).toBeNull();
    });

    it('lets the owner, a sales manager and the director price any request they can see', async () => {
      for (const actor of [PRICER_SALES_A, PRICER_MANAGER, DIRECTOR]) {
        const fixture = buildEstimateFixture();
        const { estimate, pricedLineId } = await submittedEstimate(fixture);

        const view = await fixture.pricing.setUnitCost(
          estimate.id,
          pricedLineId,
          { unitCost: 2000 },
          actor,
        );

        expect(view.panels[0].bomLines[0]).toMatchObject({
          unitCost: 2000,
          amount: 6000,
        });
      }
    });

    it('answers 404 for an unknown estimate and for a line of another estimate', async () => {
      const fixture = buildEstimateFixture();
      const first = await submittedEstimate(fixture);
      const second = await submittedEstimate(fixture);

      await expect(
        fixture.pricing.complete(99, PRICER_SALES_A),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.pricing.setUnitCost(
          first.estimate.id,
          second.pricedLineId,
          { unitCost: 5 },
          PRICER_SALES_A,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        fixture.pricing.addCostLine(
          first.estimate.id,
          second.panelId,
          { category: 'labor' as never, amount: 5 },
          PRICER_SALES_A,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('pricing a submitted revision', () => {
    it('sets a unit cost and adds, edits and removes a cost line, recomputing every time', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, panelId, pricedLineId } =
        await submittedEstimate(fixture);

      let view = await fixture.pricing.setUnitCost(
        estimate.id,
        pricedLineId,
        { unitCost: 1500.5 },
        PRICER_SALES_A,
      );
      // 3 × 1,500.5 = 4,501.5 → 4,502 per panel, two panels
      expect(view.panels[0].bomLines[0]).toMatchObject({
        unitCost: 1500.5,
        amount: 4502,
      });
      expect(view.total).toBe(9004);

      view = await fixture.pricing.addCostLine(
        estimate.id,
        panelId,
        { category: 'labor' as never, amount: 1000 },
        PRICER_SALES_A,
      );
      expect(view.panels[0]).toMatchObject({ unitCost: 5502, total: 11004 });
      const costId = view.panels[0].costLines[0].id;

      view = await fixture.pricing.updateCostLine(
        estimate.id,
        costId,
        { amount: 2000 },
        PRICER_SALES_A,
      );
      expect(view.panels[0]).toMatchObject({ unitCost: 6502, total: 13004 });

      view = await fixture.pricing.deleteCostLine(
        estimate.id,
        costId,
        PRICER_SALES_A,
      );
      expect(view.panels[0].costLines).toEqual([]);
      expect(view.total).toBe(9004);
      expect(
        (await fixture.service.findOne(estimate.id, PRICER_SALES_A)).total,
      ).toBe(9004);
      // Still a submitted revision, still unpriced.
      expect(view).toMatchObject({ status: 'submitted', pricedAt: null });
    });

    it('rejects a figure beyond the amount cap with 400 and stores nothing', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, pricedLineId } = await submittedEstimate(fixture);
      // The biggest panel and line quantities, so the largest allowed unit cost breaks the cap.
      fixture.panels.rows[0].quantity = 10_000;
      fixture.bomLines.rows[0].quantity = 1_000_000;

      await expect(
        fixture.pricing.setUnitCost(
          estimate.id,
          pricedLineId,
          { unitCost: 10_000_000_000 },
          PRICER_SALES_A,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fixture.bomLines.rows[0].unitCost).toBe(1000);
    });

    it('answers 409 unless the latest revision is submitted and the request is estimated', async () => {
      const fixture = buildEstimateFixture();
      const { request, estimate, pricedLineId, panelId } =
        await submittedEstimate(fixture);

      request.status = RequestStatus.QUOTED;
      for (const attempt of [
        () =>
          fixture.pricing.setUnitCost(
            estimate.id,
            pricedLineId,
            { unitCost: 7 },
            PRICER_SALES_A,
          ),
        () =>
          fixture.pricing.addCostLine(
            estimate.id,
            panelId,
            { category: 'labor' as never, amount: 1 },
            PRICER_SALES_A,
          ),
        () => fixture.pricing.complete(estimate.id, PRICER_SALES_A),
      ]) {
        await expect(attempt()).rejects.toBeInstanceOf(ConflictException);
      }

      request.status = RequestStatus.ESTIMATING;
      await expect(
        fixture.pricing.complete(estimate.id, PRICER_SALES_A),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fixture.bomLines.rows[0].unitCost).toBe(1000);
      expect(latest(fixture)?.pricedAt ?? null).toBeNull();
    });

    it('answers 409 while the latest revision is a draft', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await submittedEstimate(fixture);
      await fixture.service.revise(estimate.id, ENGINEER_A);
      const draftLine = fixture.bomLines.rows.at(-1) as { id: number };

      await expect(
        fixture.pricing.setUnitCost(
          estimate.id,
          draftLine.id,
          { unitCost: 9 },
          PRICER_SALES_A,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        fixture.pricing.complete(estimate.id, PRICER_SALES_A),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('complete', () => {
    it('answers 400 naming the item with no cost, then 200 once it is priced', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, free, freeLineId } = await submittedEstimate(fixture);

      const refused = fixture.pricing.complete(estimate.id, PRICER_SALES_A);
      await expect(refused).rejects.toBeInstanceOf(BadRequestException);
      await expect(refused).rejects.toThrow(free.code);
      expect(latest(fixture)?.pricedAt ?? null).toBeNull();

      await fixture.pricing.setUnitCost(
        estimate.id,
        freeLineId,
        { unitCost: 250 },
        PRICER_SALES_A,
      );
      const done = await fixture.pricing.complete(estimate.id, PRICER_SALES_A);

      expect(done.pricedAt).toBeInstanceOf(Date);
      expect(done.pricedBy).toBe(PRICER_SALES_A.userId);
      expect(latest(fixture)).toMatchObject({
        status: 'submitted',
        pricedBy: PRICER_SALES_A.userId,
      });
      expect(latest(fixture)?.pricedAt).toBeInstanceOf(Date);
    });

    it('names every item with no cost, not only the first', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, free, second } = await submittedEstimate(fixture, true);

      const refused = fixture.pricing.complete(estimate.id, PRICER_SALES_A);

      await expect(refused).rejects.toBeInstanceOf(BadRequestException);
      await expect(refused).rejects.toThrow(free.code);
      await expect(refused).rejects.toThrow(second?.code);
    });

    it('answers 409 to a second complete and to every price edit after the first', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, panelId, pricedLineId } =
        await readyToComplete(fixture);
      const costView = await fixture.pricing.addCostLine(
        estimate.id,
        panelId,
        { category: 'labor' as never, amount: 100 },
        PRICER_SALES_A,
      );
      const costId = costView.panels[0].costLines[0].id;
      await fixture.pricing.complete(estimate.id, PRICER_SALES_A);
      const frozen = JSON.stringify([
        fixture.bomLines.rows,
        fixture.costLines.rows,
        fixture.revisions.rows,
      ]);

      for (const attempt of [
        () => fixture.pricing.complete(estimate.id, PRICER_SALES_A),
        () =>
          fixture.pricing.setUnitCost(
            estimate.id,
            pricedLineId,
            { unitCost: 1 },
            PRICER_SALES_A,
          ),
        () =>
          fixture.pricing.addCostLine(
            estimate.id,
            panelId,
            { category: 'labor' as never, amount: 1 },
            PRICER_SALES_A,
          ),
        () =>
          fixture.pricing.updateCostLine(
            estimate.id,
            costId,
            { amount: 1 },
            PRICER_SALES_A,
          ),
        () =>
          fixture.pricing.deleteCostLine(estimate.id, costId, PRICER_SALES_A),
      ]) {
        await expect(attempt()).rejects.toBeInstanceOf(ConflictException);
      }

      expect(
        JSON.stringify([
          fixture.bomLines.rows,
          fixture.costLines.rows,
          fixture.revisions.rows,
        ]),
      ).toBe(frozen);
    });

    it('returns a revision the actor may read, and notifies nobody', async () => {
      const fixture = buildEstimateFixture();
      const { estimate } = await readyToComplete(fixture);
      fixture.notifications.emit.mockClear();

      const done = await fixture.pricing.complete(estimate.id, PRICER_SALES_A);

      expect(findMoneyKeys(done)).not.toEqual([]);
      expect(done.total).toBe(2 * (3 * 1000 + 250));
      expect(fixture.notifications.emit).not.toHaveBeenCalled();
    });
  });

  describe('a new revision (revise)', () => {
    it('copies the unit costs and cost lines, starts unpriced, and is priced again after the next submit', async () => {
      const fixture = buildEstimateFixture();
      const { estimate, panelId, pricedLineId } =
        await readyToComplete(fixture);
      await fixture.pricing.setUnitCost(
        estimate.id,
        pricedLineId,
        { unitCost: 1200 },
        PRICER_SALES_A,
      );
      await fixture.pricing.addCostLine(
        estimate.id,
        panelId,
        { category: 'labor' as never, amount: 400 },
        PRICER_SALES_A,
      );
      await fixture.pricing.complete(estimate.id, PRICER_SALES_A);

      const revised = await fixture.service.revise(estimate.id, ENGINEER_A);

      expect(
        (await fixture.service.findOne(estimate.id, PRICER_SALES_A)).current,
      ).toMatchObject({
        revision: 2,
        status: 'draft',
        pricedAt: null,
        panels: [
          {
            bomLines: [{ unitCost: 1200 }, { unitCost: 250 }],
            costLines: [{ amount: 400 }],
          },
        ],
      });
      expect(revised.latestRevision).toBe(2);
      expect(findMoneyKeys(revised)).toEqual([]);

      const submitted = await fixture.service.submit(estimate.id, ENGINEER_A);
      expect(submitted.current).toMatchObject({
        revision: 2,
        status: 'submitted',
        pricedAt: null,
      });
      expect(fixture.revisions.rows.map((row) => row.pricedAt ?? null)).toEqual(
        [expect.any(Date), null],
      );
      const copiedLine = fixture.bomLines.rows.at(-2)?.id as number;
      await fixture.pricing.setUnitCost(
        estimate.id,
        copiedLine,
        { unitCost: 1300 },
        PRICER_SALES_A,
      );
      await expect(
        fixture.pricing.complete(estimate.id, PRICER_SALES_A),
      ).resolves.toMatchObject({
        revision: 2,
        pricedAt: expect.any(Date) as Date,
      });
    });
  });

  describe('the list item', () => {
    it('carries latestPricedAt: null for a draft and an unpriced submit, the time once priced', async () => {
      const fixture = buildEstimateFixture();
      const request = fixture.requestAt(RequestStatus.ASSIGNED);
      const estimate = await fixture.service.create(
        { requestId: request.id },
        ENGINEER_A,
      );
      const pricedAtOf = async () =>
        (await fixture.service.findAll({}, PRICER_SALES_A)).data[0] as {
          latestPricedAt?: Date | null;
        };

      expect((await pricedAtOf()).latestPricedAt).toBeNull();

      const item = fixture.itemOf({ referencePrice: 5 });
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
      await fixture.service.submit(estimate.id, ENGINEER_A);
      expect((await pricedAtOf()).latestPricedAt).toBeNull();

      await fixture.pricing.complete(estimate.id, PRICER_SALES_A);
      expect((await pricedAtOf()).latestPricedAt).toBeInstanceOf(Date);

      // A new draft is unpriced again, even though revision 1 stays priced.
      await fixture.service.revise(estimate.id, ENGINEER_A);
      expect((await pricedAtOf()).latestPricedAt).toBeNull();
    });
  });
});
