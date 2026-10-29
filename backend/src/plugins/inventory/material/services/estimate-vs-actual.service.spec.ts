import { NotFoundException } from '@nestjs/common';

import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';
import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import { DataScopeService } from '@shared/services/data-scope.service';

import { describeWithDatabase } from '@plugins/inventory/_shared/inventory-db.helper-spec';
import {
  openIssueHarness,
  type IssueHarness,
} from '@plugins/inventory/issue/issue-db.helper-spec';
import { EstimateVsActualService } from '@plugins/inventory/material/services/estimate-vs-actual.service';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/**
 * Estimate against actual on the real Postgres of the compose stack: order O1 of the issue
 * worked example as it stands after its step 5 (X issued 4, 2 and 1 with a reason, 2 returned
 * by the workshop), its estimate X 3 per panel × 2 panels at 95 000, plus Z issued outside the
 * BOM. Then who reads which figures.
 */
describeWithDatabase('EstimateVsActualService (real Postgres)', () => {
  jest.setTimeout(30_000);

  let h: IssueHarness;
  let service: EstimateVsActualService;
  let x: number;
  let z: number;
  let o1: number;

  const actor = async (
    username: string,
    role: string,
  ): Promise<AuthUserPayload> => ({
    userId: await h.db.userId(username),
    role,
    permissions: seededRolePermissions(role) ?? [],
  });

  beforeAll(async () => {
    h = await openIssueHarness();
    service = new EstimateVsActualService(
      h.db.dataSource,
      new OrderMaterialReadPort(),
      new DataScopeService(),
    );

    x = await h.db.createItem();
    z = await h.db.createItem();
    await h.stockOf(x, '10', 100000);
    await h.stockOf(z, '1', 20000);
    o1 = (
      await h.kit.createOrder({
        deliveryDate: '2026-11-05',
        panels: 2,
        bom: [{ itemId: x, perPanel: '3', estimateUnitCost: '95000' }],
      })
    ).orderId;

    await h.issue(o1, [{ itemId: x, quantity: 4 }]).expect(201);
    await h.issue(o1, [{ itemId: x, quantity: 2 }]).expect(201);
    await h.receive(x, '3', 130000);
    await h
      .issue(o1, [{ itemId: x, quantity: 1, reason: 'Thay dây đứt' }])
      .expect(201);
    await h.workshopReturn(o1, [{ itemId: x, quantity: 2 }]).expect(201);
    await h
      .issue(o1, [{ itemId: z, quantity: 1, reason: 'thay thế' }])
      .expect(201);
  });

  afterAll(async () => {
    await h?.close();
  });

  it('compares the estimate with what went out net of returns, costs to a director', async () => {
    const report = await service.report(
      o1,
      await actor('director', 'director'),
    );

    expect(report.items.find((item) => item.itemId === x)).toMatchObject({
      estimatedQty: 6,
      actualQty: 5,
      qtyVariance: -1,
      // 3 × 95 000 per panel × 2 panels.
      estimatedCost: 570000,
      // 400 000 + 200 000 + 112 857 − 203 673.
      actualCost: 509184,
      costVariance: -60816,
    });
    // Not on the BOM: estimated nothing, still listed.
    expect(report.items.find((item) => item.itemId === z)).toMatchObject({
      estimatedQty: 0,
      actualQty: 1,
      estimatedCost: 0,
      actualCost: 20000,
      costVariance: 20000,
    });
    expect(report.totals).toEqual({
      estimatedCost: 570000,
      actualCost: 529184,
      costVariance: -40816,
    });
    expect(report.overBomIssues).toEqual([
      expect.objectContaining({
        itemId: x,
        quantity: 1,
        reason: 'Thay dây đứt',
      }),
      expect.objectContaining({ itemId: z, quantity: 1, reason: 'thay thế' }),
    ]);
    expect(report.overBomIssues[0].issueCode).toMatch(/^XK_\d{4}_\d{4}$/);
    expectNoMoneyKeys(report, ['estimatedCost', 'actualCost', 'costVariance']);

    const purchasing = await service.report(
      o1,
      await actor('purchasing', 'purchasing'),
    );
    expect(purchasing.totals?.actualCost).toBe(529184);
  });

  it('shows quantities and the over-BOM list without a cost to the storekeeper and the sales owner', async () => {
    for (const reader of [
      await actor('storekeeper', 'storekeeper'),
      await actor('sales_a', 'sales'),
    ]) {
      const report = await service.report(o1, reader);
      expect(report.items.find((item) => item.itemId === x)).toMatchObject({
        estimatedQty: 6,
        actualQty: 5,
      });
      expect(report.overBomIssues).toHaveLength(2);
      expect(report.totals).toBeUndefined();
      expectNoMoneyKeys(report);
    }
  });

  it('keeps an item the estimate costs but the order’s BOM does not hold, issued or not', async () => {
    const w = await h.db.createItem();
    // The estimate has W, the order's BOM lost it (a legacy line the backfill left unlinked).
    await h.db.dataSource.query(
      `INSERT INTO sales_estimate_bom_lines
         (panel_id, item_id, item_code, item_name, item_unit, quantity, unit_cost, amount)
       SELECT p.id, $2, 'W', 'Estimate only', 'Cái', 1, 30000, 30000
         FROM sales_orders o JOIN sales_estimate_panels p ON p.revision_id = o.estimate_revision_id
        WHERE o.id = $1`,
      [o1, w],
    );
    const director = await actor('director', 'director');

    const before = await service.report(o1, director);
    // 1 per panel × 2 panels, not issued yet.
    expect(before.items.find((item) => item.itemId === w)).toMatchObject({
      estimatedQty: 0,
      actualQty: 0,
      estimatedCost: 60000,
      actualCost: 0,
    });
    expect(before.totals?.estimatedCost).toBe(630000);

    await h.stockOf(w, '1', 30000);
    await h
      .issue(o1, [{ itemId: w, quantity: 1, reason: 'Theo dự toán' }])
      .expect(201);
    const after = await service.report(o1, director);
    expect(after.totals?.estimatedCost).toBe(630000);
    expect(after.items.find((item) => item.itemId === w)).toMatchObject({
      estimatedCost: 60000,
      actualQty: 1,
      actualCost: 30000,
    });
  });

  it('answers 404 for another salesperson’s order', async () => {
    await expect(
      service.report(o1, await actor('sales_b', 'sales')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
