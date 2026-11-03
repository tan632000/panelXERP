import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import { shortageKit } from '@plugins/inventory/_shared/order-shortage.helper-spec';
import {
  describeWithDatabase,
  openProductionHarness,
  type ProductionHarness,
} from '@plugins/production/production-order/production-db.helper-spec';

interface ShortBody {
  itemCode: string;
  short: number;
}

/**
 * The shortage of a released production order over HTTP against the real Postgres of the
 * compose stack: the figure is the material view's own, the data scope matches the detail,
 * and nothing in the answer is a price.
 */
describeWithDatabase('Production order shortage (real Postgres)', () => {
  jest.setTimeout(60_000);

  let h: ProductionHarness;
  let kit: ReturnType<typeof shortageKit>;

  beforeAll(async () => {
    h = await openProductionHarness([]);
    kit = shortageKit(h.dataSource);
  });

  afterAll(async () => {
    await h?.close();
  });

  const releasedOrder = async () => {
    const item = await h.createItem();
    const orderId = await h.newOrder({
      panels: [
        {
          tag: 'MSB',
          quantity: 2,
          bomLines: [{ itemId: item.id, itemCode: item.code, quantity: '1' }],
        },
      ],
    });
    const created = await h.createProduction(orderId).expect(201);
    const id = (created.body as { id: number }).id;
    await h.prepare(id);
    await h.post(`/production/orders/${id}/release`, {}).expect(200);
    return { id, orderId, item };
  };

  it('shows short 2 for the item, equal to the material view, while the order is in production', async () => {
    const { id, orderId, item } = await releasedOrder();
    expect(await h.statusOfOrder(orderId)).toBe('in_production');

    const res = await h.get(`/production/orders/${id}/shortage`).expect(200);
    const short = res.body as ShortBody[];
    expect(short).toMatchObject([{ itemCode: item.code, short: 2 }]);
    expectNoMoneyKeys(res.body);

    expect(await kit.viewShort(orderId, item.id, h.actors.manager)).toBe(
      short[0].short,
    );
  });

  it('answers the readers of the production order and 404 to everyone else', async () => {
    const { id } = await releasedOrder();
    const path = `/production/orders/${id}/shortage`;

    for (const actor of ['manager', 'techA', 'salesA', 'director'] as const) {
      await h.get(path, actor).expect(200);
    }
    // A technician without a cabinet on the order, and the sales owner of another order.
    await h.get(path, 'techB').expect(404);
    await h.get(path, 'salesB').expect(404);
    await h.get('/production/orders/2147483647/shortage').expect(404);
  });
});
