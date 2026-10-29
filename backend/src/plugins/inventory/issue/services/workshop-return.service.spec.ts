import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import { describeWithDatabase } from '@plugins/inventory/_shared/inventory-db.helper-spec';
import {
  openIssueHarness,
  type IssueHarness,
} from '@plugins/inventory/issue/issue-db.helper-spec';
import {
  playIssueSteps,
  stockOf,
} from '@plugins/inventory/issue/issue-worked-example.helper-spec';

interface DocumentBody {
  id: number;
  code: string;
  lines: Array<Record<string, unknown>>;
}
const bodyOf = (res: { body: unknown }) => res.body as DocumentBody;

/**
 * Workshop returns against the real Postgres of the compose stack: steps 5 and 6 of the worked
 * example after the issues of steps 1–4.
 */
describeWithDatabase('WorkshopReturnService (real Postgres)', () => {
  let h: IssueHarness;

  beforeAll(async () => {
    h = await openIssueHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  it('returns at the order’s net issued average and gives the order back what it lacks', async () => {
    const { x, o1, o2 } = await playIssueSteps(h);

    // 5. X 2 at (400 000 + 200 000 + 112 857) / 7 = 101 836.7143 → +203 673.
    const returned = await h
      .workshopReturn(o1, [{ itemId: x, quantity: 2 }])
      .expect(201);
    expectNoMoneyKeys(returned.body);
    expect(bodyOf(returned).code).toMatch(/^NT_\d{4}_\d{4}$/);
    expect(await stockOf(h, x)).toEqual({ onHand: '8', value: '880816' });
    const [movement]: Array<{ unit_cost: string; avg: string }> =
      await h.db.dataSource.query(
        `SELECT unit_cost::text, avg_cost_after::text AS avg FROM stock_movements
          WHERE item_id = $1 AND movement_type = 'workshop_return'`,
        [x],
      );
    expect(movement).toEqual({ unit_cost: '101836.7143', avg: '110102.0000' });
    expect(await h.netIssued(o1, x)).toBe('5');
    // O1 is short 1 again and takes it first; 1 unit stays free.
    expect(await h.kit.reservationsOf(x)).toEqual({ [o1]: '1', [o2]: '6' });

    const priced = await h
      .get(`/inventory/workshop-returns/${bodyOf(returned).id}`, h.PURCHASING)
      .expect(200);
    expect(bodyOf(priced).lines[0]).toMatchObject({
      unitCost: 101836.7143,
      value: 203673,
    });

    // 6. More than is out: refused. Issues to a cancelled order are refused, returns are not.
    await h.workshopReturn(o1, [{ itemId: x, quantity: 6 }]).expect(409);
    await h.kit.cancel(o1);
    await h.issue(o1, [{ itemId: x, quantity: 1 }]).expect(409);
    await h.workshopReturn(o1, [{ itemId: x, quantity: 1 }]).expect(201);
    // O1 is no candidate any more and O2 is not short: the unit stays free.
    expect(await h.kit.reservationsOf(x)).toEqual({ [o2]: '6' });
    expect(await h.netIssued(o1, x)).toBe('4');
  });

  it('refuses a return naming a panel of another order', async () => {
    const x = await h.db.createItem();
    await h.stockOf(x, '2', 1000);
    const order = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '2' }] })
    ).orderId;
    const other = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '1' }] })
    ).orderId;
    await h.issue(order, [{ itemId: x, quantity: 2 }]).expect(201);
    const [otherPanel]: Array<{ id: number }> = await h.db.dataSource.query(
      `SELECT id FROM sales_order_lines WHERE order_id = $1`,
      [other],
    );

    await h
      .workshopReturn(order, [
        { itemId: x, quantity: 1, orderLineId: otherPanel.id },
      ])
      .expect(400);
    expect(await h.netIssued(order, x)).toBe('2');
  });

  it('refuses a return of an item the order never received', async () => {
    const x = await h.db.createItem();
    const order = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '2' }] })
    ).orderId;
    await h.workshopReturn(order, [{ itemId: x, quantity: 1 }]).expect(409);
    expect(await h.movementCount(order, x)).toBe(0);
  });
});
