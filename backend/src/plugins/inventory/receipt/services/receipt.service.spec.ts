import { randomUUID } from 'crypto';

import { Decimal } from 'decimal.js';
import request from 'supertest';

import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import { describeWithDatabase } from '@plugins/inventory/_shared/inventory-db.helper-spec';
import {
  openReceiptHarness,
  type ReceiptHarness,
} from '@plugins/inventory/receipt/receipt-db.helper-spec';

const exact = (text: string) => new Decimal(text).toFixed();

interface ReceiptBody {
  id: number;
  code: string;
  message?: string;
  data?: unknown[];
  lines: Array<Record<string, unknown>>;
}
/** The JSON a response carries, typed for the assertions. */
const bodyOf = (res: { body: unknown }) => res.body as ReceiptBody;

/**
 * The task's worked example against the real Postgres of the compose stack: receipts over HTTP,
 * each step asserting the order's status, the received quantities, stock on hand and value,
 * and the reservations the new stock was handed to.
 */
describeWithDatabase('StockReceiptService (real Postgres)', () => {
  let h: ReceiptHarness;

  beforeAll(async () => {
    h = await openReceiptHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  it('receives the worked example: partial, refused, complete, closed to more', async () => {
    const x = await h.db.createItem();
    const y = await h.db.createItem();
    const o2 = await h.kit.createOrder({
      deliveryDate: '2026-11-05',
      bom: [{ itemId: x, perPanel: '4' }],
    });
    const o3 = await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '4' }] });
    const po = await h.createPurchaseOrder([
      {
        itemId: x,
        quantity: '10',
        unitPrice: 100000,
        sourceOrderId: o3.orderId,
      },
      { itemId: y, quantity: '5', unitPrice: 20000 },
    ]);
    const [lineX, lineY] = po.lineIds;

    // 1. X 6: the source order O3 takes its 4 first, then O2 (earliest date) the other 2.
    const first = await h
      .receive(po.id, [{ poLineId: lineX, quantity: 6 }])
      .expect(201);
    expect(bodyOf(first).code).toMatch(/^NK_\d{4}_\d{4}$/);
    expect(await h.orderState(po.id)).toEqual({
      status: 'partially_received',
      received: ['6', '0'],
    });
    const xAfterFirst = await h.db.totals(x);
    expect(exact(xAfterFirst.onHand)).toBe('6');
    expect(exact(xAfterFirst.value)).toBe('600000');
    expect(await h.kit.reservationsOf(x)).toEqual({
      [o3.orderId]: '4',
      [o2.orderId]: '2',
    });
    expect(await h.kit.alerts.shortItemCount(o2.orderId)).toBe(1);

    // 2. X 5 with 4 remaining: refused, nothing written.
    const refused = await h
      .receive(po.id, [{ poLineId: lineX, quantity: 5 }])
      .expect(409);
    expect(String(bodyOf(refused).message)).toContain('only 4 remain');
    expect(await h.orderState(po.id)).toEqual({
      status: 'partially_received',
      received: ['6', '0'],
    });
    expect(await h.documentsOf(po.id)).toEqual({ receipts: 1, movements: 1 });

    // 3. X 4 and Y 5: the order is complete; O2 gets the 2 it still lacked.
    await h
      .receive(po.id, [
        { poLineId: lineX, quantity: 4 },
        { poLineId: lineY, quantity: 5 },
      ])
      .expect(201);
    expect(await h.orderState(po.id)).toEqual({
      status: 'received',
      received: ['10', '5'],
    });
    expect(await h.kit.reservationsOf(x)).toEqual({
      [o3.orderId]: '4',
      [o2.orderId]: '4',
    });
    expect(await h.kit.alerts.shortItemCount(o2.orderId)).toBe(0);
    expect(exact((await h.db.totals(y)).value)).toBe('100000');

    // 4. Y 1 on a received order.
    await h.receive(po.id, [{ poLineId: lineY, quantity: 1 }]).expect(409);
    expect(await h.documentsOf(po.id)).toEqual({ receipts: 2, movements: 3 });
  });

  it('accepts 0.1 then 0.2 on a line of 0.3 and leaves exactly nothing remaining', async () => {
    const z = await h.db.createItem();
    const po = await h.createPurchaseOrder([
      { itemId: z, quantity: '0.3', unitPrice: 1000 },
    ]);
    const [lineZ] = po.lineIds;

    await h.receive(po.id, [{ poLineId: lineZ, quantity: 0.1 }]).expect(201);
    // In float, 0.3 − 0.1 is 0.19999999999999998: 0.2 would count as more than remains.
    await h.receive(po.id, [{ poLineId: lineZ, quantity: 0.2 }]).expect(201);
    expect(await h.orderState(po.id)).toEqual({
      status: 'received',
      received: ['0.3'],
    });
  });

  it('refuses an order that is not approved, and a line of another order', async () => {
    const item = await h.db.createItem();
    const draft = await h.createPurchaseOrder(
      [{ itemId: item, quantity: '2', unitPrice: 1000 }],
      'draft',
    );
    const other = await h.createPurchaseOrder([
      { itemId: item, quantity: '2', unitPrice: 1000 },
    ]);

    await h
      .receive(draft.id, [{ poLineId: draft.lineIds[0], quantity: 1 }])
      .expect(409);
    await h
      .receive(other.id, [{ poLineId: draft.lineIds[0], quantity: 1 }])
      .expect(400);
    await h
      .receive(other.id, [{ poLineId: other.lineIds[0], quantity: 0 }])
      .expect(400);
    expect(await h.documentsOf(draft.id)).toEqual({
      receipts: 0,
      movements: 0,
    });
    expect(await h.documentsOf(other.id)).toEqual({
      receipts: 0,
      movements: 0,
    });
    expect((await h.orderState(other.id)).received).toEqual(['0']);
  });

  it('counts two lines of one request on the same order line together', async () => {
    const item = await h.db.createItem();
    const po = await h.createPurchaseOrder([
      { itemId: item, quantity: '3', unitPrice: 1000 },
    ]);
    const [line] = po.lineIds;

    await h
      .receive(po.id, [
        { poLineId: line, quantity: 2 },
        { poLineId: line, quantity: 2 },
      ])
      .expect(409);
    expect(await h.documentsOf(po.id)).toEqual({ receipts: 0, movements: 0 });
  });

  it('answers a stored request key with the same receipt and posts once', async () => {
    const item = await h.db.createItem();
    const po = await h.createPurchaseOrder([
      { itemId: item, quantity: '5', unitPrice: 1000 },
    ]);
    const requestKey = randomUUID();
    const body = [{ poLineId: po.lineIds[0], quantity: 2 }];

    const first = await h.receive(po.id, body, { requestKey }).expect(201);
    const again = await h.receive(po.id, body, { requestKey }).expect(200);
    expect(bodyOf(again).id).toBe(bodyOf(first).id);
    expect(await h.documentsOf(po.id)).toEqual({ receipts: 1, movements: 1 });
    expect((await h.orderState(po.id)).received).toEqual(['2']);
  });

  it('serves the storekeeper no money key, and purchasing the unit cost', async () => {
    const item = await h.db.createItem();
    const po = await h.createPurchaseOrder([
      { itemId: item, quantity: '4', unitPrice: 12345 },
    ]);
    const posted = await h
      .receive(po.id, [{ poLineId: po.lineIds[0], quantity: 1 }])
      .expect(201);
    expectNoMoneyKeys(posted.body);

    const server = h.app.getHttpServer();
    const list = await request(server)
      .get(`/inventory/receipts?purchaseOrderId=${po.id}`)
      .set({ 'x-test-actor': h.STOREKEEPER })
      .expect(200);
    expect(bodyOf(list).data).toHaveLength(1);
    expectNoMoneyKeys(list.body);

    const detail = await request(server)
      .get(`/inventory/receipts/${bodyOf(posted).id}`)
      .set({ 'x-test-actor': h.STOREKEEPER })
      .expect(200);
    expectNoMoneyKeys(detail.body);
    expect(bodyOf(detail).lines[0]).toMatchObject({
      quantity: 1,
      itemUnit: 'Cái',
    });

    const priced = await request(server)
      .get(`/inventory/receipts/${bodyOf(posted).id}`)
      .set({ 'x-test-actor': h.PURCHASING })
      .expect(200);
    expect(bodyOf(priced).lines[0].unitCost).toBe(12345);
  });
});
