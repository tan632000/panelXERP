import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import { DataScopeService } from '@shared/services/data-scope.service';

import { describeWithDatabase } from '@plugins/inventory/_shared/inventory-db.helper-spec';
import {
  openIssueHarness,
  type IssueHarness,
} from '@plugins/inventory/issue/issue-db.helper-spec';
import { playIssueSteps } from '@plugins/inventory/issue/issue-worked-example.helper-spec';
import { MaterialService } from '@plugins/inventory/material/services/material.service';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';

interface DocumentBody {
  id: number;
  code: string;
  orderId: number;
  lines: Array<Record<string, unknown>>;
}
const bodyOf = (res: { body: unknown }) => res.body as DocumentBody;

/**
 * Issues against the real Postgres of the compose stack, over HTTP: the worked example step by
 * step (reservations, on hand, value), the refusals, and what a storekeeper is shown.
 */
describeWithDatabase('StockIssueService (real Postgres)', () => {
  let h: IssueHarness;

  beforeAll(async () => {
    h = await openIssueHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  it('issues the worked example: own reservation first, never another order’s, a reason beyond the BOM', async () => {
    const { x, o1 } = await playIssueSteps(h);

    // The material view lists the line issued beyond the BOM with its reason.
    const material = new MaterialService(
      h.db.dataSource,
      new OrderMaterialReadPort(),
      new DataScopeService(),
    );
    const detail = await material.findOrder(o1, {
      userId: 1,
      role: 'purchasing',
    });
    expect(detail.overBomIssues).toEqual([
      expect.objectContaining({
        itemId: x,
        quantity: 1,
        reason: 'Thay dây đứt',
      }),
    ]);
    expect(detail.items.find((item) => item.itemId === x)).toMatchObject({
      demand: 6,
      issued: 7,
      returned: 0,
    });
  });

  it('refuses a panel line of another order, and an order that is not open', async () => {
    const x = await h.db.createItem();
    await h.stockOf(x, '5', 1000);
    const mine = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '1' }] })
    ).orderId;
    const other = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '1' }] })
    ).orderId;
    const [otherPanel]: Array<{ id: number }> = await h.db.dataSource.query(
      `SELECT id FROM sales_order_lines WHERE order_id = $1`,
      [other],
    );

    await h
      .issue(mine, [{ itemId: x, quantity: 1, orderLineId: otherPanel.id }])
      .expect(400);
    await h.kit.cancel(other);
    await h.issue(other, [{ itemId: x, quantity: 1 }]).expect(409);
    await h.issue(2147483000, [{ itemId: x, quantity: 1 }]).expect(404);
    expect(await h.movementCount(mine, x)).toBe(0);
    expect(await h.movementCount(other, x)).toBe(0);
  });

  it('keeps an order in production demanding, reserving, issuing and taking returns, until it is delivered', async () => {
    const x = await h.db.createItem();
    await h.stockOf(x, '3', 1000);
    const { orderId } = await h.kit.createOrder({
      bom: [{ itemId: x, perPanel: '5' }],
    });
    expect(await h.kit.reservationsOf(x)).toEqual({ [orderId]: '3' });

    // A release moves the order the way the production port does, and nothing else.
    await h.db.dataSource.transaction((manager) =>
      new OrderProductionPort().moveStatus(
        manager,
        orderId,
        'open',
        'in_production',
      ),
    );
    expect(await h.kit.reservationsOf(x)).toEqual({ [orderId]: '3' });

    // Its demand still takes what arrives, and the workshop still issues and returns.
    await h.kit.receive(x, '2');
    expect(await h.kit.reservationsOf(x)).toEqual({ [orderId]: '5' });
    await h.issue(orderId, [{ itemId: x, quantity: 2 }]).expect(201);
    await h.workshopReturn(orderId, [{ itemId: x, quantity: 1 }]).expect(201);
    expect(await h.netIssued(orderId, x)).toBe('1');

    // A delivered order is out of both lists.
    await h.db.dataSource.query(
      `UPDATE sales_orders SET status = 'delivered' WHERE id = $1`,
      [orderId],
    );
    await h.issue(orderId, [{ itemId: x, quantity: 1 }]).expect(409);
    await h.workshopReturn(orderId, [{ itemId: x, quantity: 1 }]).expect(409);
    expect(await h.netIssued(orderId, x)).toBe('1');
  });

  it('lists only the documents of orders the reader’s scope reaches', async () => {
    const x = await h.db.createItem();
    await h.stockOf(x, '2', 1000);
    // The reservation kit's orders belong to sales_a.
    const order = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '2' }] })
    ).orderId;
    await h.issue(order, [{ itemId: x, quantity: 1 }]).expect(201);

    const salesReader = async (username: string) =>
      JSON.stringify({
        userId: await h.db.userId(username),
        role: 'sales',
        permissions: ['stock_issue:read'],
      });
    const path = `/inventory/issues?orderId=${order}`;
    const own = await h.get(path, await salesReader('sales_a')).expect(200);
    expect((own.body as { meta: { total: number } }).meta.total).toBe(1);
    const other = await h.get(path, await salesReader('sales_b')).expect(200);
    expect(other.body).toMatchObject({ data: [], meta: { total: 0 } });
  });

  it('serves the storekeeper no money key, and purchasing the line cost', async () => {
    const x = await h.db.createItem();
    await h.stockOf(x, '4', 25000);
    const order = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '4' }] })
    ).orderId;
    const posted = await h
      .issue(order, [{ itemId: x, quantity: 1 }])
      .expect(201);
    expectNoMoneyKeys(posted.body);

    const list = await h.get(`/inventory/issues?orderId=${order}`).expect(200);
    expectNoMoneyKeys(list.body);
    const detail = await h
      .get(`/inventory/issues/${bodyOf(posted).id}`)
      .expect(200);
    expectNoMoneyKeys(detail.body);
    expect(bodyOf(detail).code).toMatch(/^XK_\d{4}_\d{4}$/);

    const priced = await h
      .get(`/inventory/issues/${bodyOf(posted).id}`, h.PURCHASING)
      .expect(200);
    expect(bodyOf(priced).lines[0]).toMatchObject({
      unitCost: 25000,
      value: -25000,
    });
  });
});
