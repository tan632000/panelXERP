import { describeWithDatabase } from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { PURCHASE_REQUEST_REFERENCE_CHECK } from '@plugins/inventory/purchase-request/constants/purchase-request.constant';
import {
  openPurchaseRequestHarness,
  type PurchaseRequestHarness,
} from '@plugins/inventory/purchase-request/purchase-request-db.helper-spec';

interface RequestBody {
  id: number;
  code: string;
  status: string;
  lines: Array<{
    id: number;
    itemId: number;
    quantity: number;
    sourceOrderId: number | null;
    ordered: number;
    remaining: number;
  }>;
}
interface OrderBody {
  id: number;
  status: string;
  lines: Array<{ id: number }>;
}
const requestOf = (res: { body: unknown }) => res.body as RequestBody;
const orderOf = (res: { body: unknown }) => res.body as OrderBody;

/**
 * Purchase requests against the real Postgres of the compose stack, over HTTP: the task's
 * worked example (requested, ordered and remaining quantities through a cancelled, a closed and
 * a returned-against purchase order) and who may raise, convert and see what.
 */
describeWithDatabase('PurchaseRequestService (real Postgres)', () => {
  jest.setTimeout(30_000);

  let h: PurchaseRequestHarness;

  beforeAll(async () => {
    h = await openPurchaseRequestHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  const fromOrder = (token: string, orderId: number) =>
    h.post(token, `/inventory/purchase-requests/from-order/${orderId}`);
  const convert = (token: string, prLineId: number, quantity: number) =>
    h.post(token, '/inventory/purchase-orders/from-requests', {
      supplierId: h.supplierId,
      lines: [{ prLineId, quantity }],
    });
  const requestState = async (id: number) =>
    requestOf(
      await h
        .get(h.PURCHASING, `/inventory/purchase-requests/${id}`)
        .expect(200),
    );
  const poAction = (
    token: string,
    id: number,
    action: string,
    reason?: string,
  ) =>
    h.post(
      token,
      `/inventory/purchase-orders/${id}/${action}`,
      reason === undefined ? {} : { reason },
    );

  it('keeps ordered and remaining right through cancelled, closed and returned orders', async () => {
    const x = await h.db.createItem({ referencePrice: 12000 });
    const o3 = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '10' }] })
    ).orderId;

    // 1. The shortage of O3 becomes PR1, line X 10 for O3.
    const created = await fromOrder(h.PURCHASING, o3).expect(201);
    const pr1 = requestOf(created);
    h.track(pr1.id);
    expect(pr1.code).toMatch(/^PR_\d{4}_\d{4}$/);
    expect(pr1.lines).toEqual([
      expect.objectContaining({
        itemId: x,
        quantity: 10,
        sourceOrderId: o3,
        remaining: 10,
      }),
    ]);
    const [line] = pr1.lines;

    // 2. Everything O3 lacks is requested already.
    await fromOrder(h.PURCHASING, o3).expect(409);

    // 3. 6 of it on a draft PO, priced at the reference price, remembering O3.
    const poA = orderOf(await convert(h.PURCHASING, line.id, 6).expect(201));
    expect(poA.status).toBe('draft');
    const [poALine]: Array<{
      source_order_id: number;
      pr_line_id: number;
      unit_price: string;
    }> = await h.db.dataSource.query(
      `SELECT source_order_id, pr_line_id, trim_scale(unit_price)::text AS unit_price
           FROM purchase_order_lines WHERE purchase_order_id = $1`,
      [poA.id],
    );
    expect(poALine).toEqual({
      source_order_id: o3,
      pr_line_id: line.id,
      unit_price: '12000',
    });
    expect(await requestState(pr1.id)).toMatchObject({
      status: 'open',
      lines: [expect.objectContaining({ ordered: 6, remaining: 4 })],
    });

    // Repricing the draft keeps its link to PR1 and O3, and a line of its own can follow;
    // changing what the request line orders, or dropping it, is refused.
    await h
      .patch(h.PURCHASING, `/inventory/purchase-orders/${poA.id}`, {
        lines: [
          { itemId: x, quantity: 6, unitPrice: 11500 },
          { itemId: x, quantity: 1, unitPrice: 11000 },
        ],
      })
      .expect(200);
    for (const lines of [
      [{ itemId: x, quantity: 7, unitPrice: 11500 }],
      [{ itemId: x, quantity: 1, unitPrice: 11000 }],
      [
        { itemId: x, quantity: 1, unitPrice: 11000 },
        { itemId: x, quantity: 6, unitPrice: 11500 },
      ],
    ]) {
      await h
        .patch(h.PURCHASING, `/inventory/purchase-orders/${poA.id}`, { lines })
        .expect(409);
    }
    const repriced: Array<{
      line_no: number;
      source_order_id: number | null;
      pr_line_id: number | null;
      quantity: string;
      unit_price: string;
    }> = await h.db.dataSource.query(
      `SELECT line_no, source_order_id, pr_line_id, trim_scale(quantity)::text AS quantity,
              trim_scale(unit_price)::text AS unit_price
           FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY line_no`,
      [poA.id],
    );
    expect(repriced).toEqual([
      {
        line_no: 1,
        source_order_id: o3,
        pr_line_id: line.id,
        quantity: '6',
        unit_price: '11500',
      },
      {
        line_no: 2,
        source_order_id: null,
        pr_line_id: null,
        quantity: '1',
        unit_price: '11000',
      },
    ]);
    // Its own line is replaced like on any draft: back to the request line alone.
    await h
      .patch(h.PURCHASING, `/inventory/purchase-orders/${poA.id}`, {
        lines: [{ itemId: x, quantity: 6, unitPrice: 11500 }],
      })
      .expect(200);
    const [{ count }]: Array<{ count: number }> = await h.db.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM purchase_order_lines WHERE purchase_order_id = $1`,
      [poA.id],
    );
    expect(count).toBe(1);
    expect((await requestState(pr1.id)).lines[0]).toMatchObject({
      ordered: 6,
      remaining: 4,
    });

    // 4. Cancelling PO_A gives the 6 back to the request.
    await poAction(h.PURCHASING, poA.id, 'cancel', 'Đổi nhà cung cấp').expect(
      200,
    );
    expect((await requestState(pr1.id)).lines[0]).toMatchObject({
      ordered: 0,
      remaining: 10,
    });

    // 5. PO_B for 6: approved, 2 received (to O3), then closed: only the 2 stay committed.
    const poB = orderOf(await convert(h.PURCHASING, line.id, 6).expect(201));
    await poAction(h.PURCHASING, poB.id, 'submit').expect(200);
    await poAction(h.DIRECTOR, poB.id, 'approve').expect(200);
    await h
      .post(h.STOREKEEPER, '/inventory/receipts', {
        purchaseOrderId: poB.id,
        lines: [{ poLineId: poB.lines[0].id, quantity: 2 }],
      })
      .expect(201);
    expect(await h.kit.reservationsOf(x)).toEqual({ [o3]: '2' });
    await poAction(h.PURCHASING, poB.id, 'close', 'NCC hết hàng').expect(200);
    expect((await requestState(pr1.id)).lines[0]).toMatchObject({
      ordered: 2,
      remaining: 8,
    });
    // O3 short 8, 8 still requested, nothing on its way from the closed order.
    await fromOrder(h.PURCHASING, o3).expect(409);

    // 6. 1 back to the supplier of the closed PO_B: the request asks for it again.
    await h
      .post(h.STOREKEEPER, '/inventory/supplier-returns', {
        purchaseOrderId: poB.id,
        reason: 'Hàng lỗi',
        lines: [{ poLineId: poB.lines[0].id, quantity: 1 }],
      })
      .expect(201);
    expect((await requestState(pr1.id)).lines[0]).toMatchObject({
      ordered: 1,
      remaining: 9,
    });
    expect(await h.kit.reservationsOf(x)).toEqual({ [o3]: '1' });
    // O3 short 9 = 9 still requested + 0 incoming: no phantom incoming from the closed order.
    await fromOrder(h.PURCHASING, o3).expect(409);
  });

  it('lets the right people raise, convert and request from an order', async () => {
    const x = await h.db.createItem();
    const order = (
      await h.kit.createOrder({ bom: [{ itemId: x, perPanel: '3' }] })
    ).orderId;
    const manual = { lines: [{ itemId: x, quantity: 2 }] };

    await h
      .post(
        await h.as('sales_a', 'sales'),
        '/inventory/purchase-requests',
        manual,
      )
      .expect(403);
    await h
      .post(h.DIRECTOR, '/inventory/purchase-requests', manual)
      .expect(403);
    for (const token of [h.STOREKEEPER, await h.as('engineer_a', 'engineer')]) {
      const raised = requestOf(
        await h.post(token, '/inventory/purchase-requests', manual).expect(201),
      );
      h.track(raised.id);
      await h
        .post(token, '/inventory/purchase-orders/from-requests', {
          supplierId: h.supplierId,
          lines: [{ prLineId: raised.lines[0].id, quantity: 1 }],
        })
        .expect(403);
    }

    // A request raised from the order names it only to readers who may see its material.
    const fromIt = requestOf(await fromOrder(h.PURCHASING, order).expect(201));
    h.track(fromIt.id);
    expect(fromIt.lines[0]).toMatchObject({ sourceOrderId: order });
    const engineerView = requestOf(
      await h
        .get(
          await h.as('engineer_a', 'engineer'),
          `/inventory/purchase-requests/${fromIt.id}`,
        )
        .expect(200),
    );
    expect(engineerView.lines[0]).toMatchObject({
      sourceOrderId: null,
      sourceOrderCode: null,
    });

    // The order's material is outside an engineer's and another salesperson's scope.
    await fromOrder(await h.as('engineer_a', 'engineer'), order).expect(404);
    await fromOrder(
      await h.as('sales_b', 'sales', ['purchase_request:create']),
      order,
    ).expect(404);
  });

  it('vetoes deleting an item on a live request and edits only what nothing ordered', async () => {
    const x = await h.db.createItem();
    const raised = requestOf(
      await h
        .post(h.PURCHASING, '/inventory/purchase-requests', {
          lines: [{ itemId: x, quantity: 4 }],
        })
        .expect(201),
    );
    h.track(raised.id);
    expect(await h.itemChecks.referencingItem(x)).toContain(
      PURCHASE_REQUEST_REFERENCE_CHECK,
    );

    // Nothing ordered yet: the lines can be replaced.
    await h
      .patch(h.PURCHASING, `/inventory/purchase-requests/${raised.id}`, {
        lines: [{ itemId: x, quantity: 5 }],
      })
      .expect(200);
    const edited = await requestState(raised.id);
    expect(edited.lines).toEqual([
      expect.objectContaining({ quantity: 5, remaining: 5 }),
    ]);

    await convert(h.PURCHASING, edited.lines[0].id, 1).expect(201);
    await h
      .patch(h.PURCHASING, `/inventory/purchase-requests/${raised.id}`, {
        lines: [{ itemId: x, quantity: 9 }],
      })
      .expect(409);
    await h
      .post(h.PURCHASING, `/inventory/purchase-requests/${raised.id}/cancel`, {
        reason: 'Không cần',
      })
      .expect(409);
    await convert(h.PURCHASING, edited.lines[0].id, 5).expect(409);
  });
});
