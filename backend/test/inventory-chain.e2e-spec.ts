import { randomBytes } from 'crypto';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { HttpExceptionFilter } from '@kernel/shared/filters/http-exception.filter';
import { LoggerService } from '@kernel/shared/logger/logger.service';
import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import { validationExceptionFactory } from '@shared/utils/validation-error.util';

import { AppModule } from '@src/app.module';

import type { App } from 'supertest/types';

jest.setTimeout(180_000);

interface Session {
  token: string;
  userId: number;
}

interface Stock {
  onHand: number;
  reserved: number;
  available: number;
}

interface PurchaseOrderBody {
  id: number;
  status: string;
  lines: Array<{
    id: number;
    itemId: number;
    quantity: number;
    unitPrice: number;
    receivedQty: number;
  }>;
}

interface MaterialBody {
  items: Array<{
    itemId: number;
    demand: number;
    reserved: number;
    issued: number;
    returned: number;
    short: number;
  }>;
}

interface OrderNotice {
  event_type: string;
  dedupe_key: string | null;
  role_codes: string[];
  user_ids: number[];
}

interface LowNotice {
  id: number;
  status: string;
  dedupe_key: string | null;
}

const ORDER_SHORT_EVENTS = [
  'inventory.order.short',
  'inventory.order.short.owner',
];
const STOCK_LOW_EVENT = 'inventory.stock.low';

/**
 * The purchasing and warehouse chain over HTTP against the compose Postgres, every actor a
 * seeded demo account: opening stock by an approved count, an order short of material, a
 * purchase request from that shortage turned into an approved purchase order, its receipt
 * going to the order first, issues to the workshop and a return, then the estimate against
 * the actual. On the way it checks who reads what, that no price reaches a reader without
 * `purchase_price:read`, and that the ledger adds up. Every row the run creates is removed by
 * id in `afterAll`.
 */
describe('Inventory chain (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const tag = randomBytes(4).toString('hex');

  const sessions = new Map<string, Session>();
  const sessionIds: number[] = [];
  const created = {
    supplierId: 0,
    locationId: 0,
    x: 0,
    y: 0,
    stocktakeId: 0,
    customerId: 0,
    projectId: 0,
    requestId: 0,
    estimateId: 0,
    quotationId: 0,
    orderId: 0,
    purchaseRequestId: 0,
    purchaseOrderId: 0,
  };

  const server = () => app.getHttpServer();
  const auth = (user: string) => {
    const session = sessions.get(user);
    if (!session) throw new Error(`${user} is not signed in`);
    return { Authorization: `Bearer ${session.token}` };
  };
  const get = (user: string, path: string) =>
    request(server()).get(`/api/v1${path}`).set(auth(user));
  const post = (user: string, path: string, body: object = {}) =>
    request(server()).post(`/api/v1${path}`).set(auth(user)).send(body);
  const patch = (user: string, path: string, body: object) =>
    request(server()).patch(`/api/v1${path}`).set(auth(user)).send(body);

  const login = async (username: string) => {
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) throw new Error('SEED_ADMIN_PASSWORD is not set');
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ username, password })
      .expect(201);
    const body = res.body as { accessToken: string; user: { id: number } };
    sessions.set(username, { token: body.accessToken, userId: body.user.id });
    const claims = JSON.parse(
      Buffer.from(body.accessToken.split('.')[1], 'base64url').toString(),
    ) as { sid?: number };
    if (typeof claims.sid === 'number') sessionIds.push(claims.sid);
  };

  /** On hand, reserved and available of one item as the availability endpoint serves it. */
  const stockOf = async (itemId: number): Promise<Stock> => {
    const res = await get(
      'storekeeper',
      `/inventory/stock/availability?itemIds=${itemId}`,
    ).expect(200);
    const [row] = res.body as Array<Stock & { itemId: number }>;
    return {
      onHand: row.onHand,
      reserved: row.reserved,
      available: row.available,
    };
  };
  const expectStock = async (expected: { x: Stock; y: Stock }) => {
    expect({
      x: await stockOf(created.x),
      y: await stockOf(created.y),
    }).toEqual(expected);
  };
  const stock = (onHand: number, reserved: number): Stock => ({
    onHand,
    reserved,
    available: onHand - reserved,
  });

  const material = async (user = 'storekeeper') =>
    (
      await get(user, `/inventory/materials/orders/${created.orderId}`).expect(
        200,
      )
    ).body as MaterialBody;
  const shortOf = async () => {
    const view = await material();
    const of = (itemId: number) =>
      view.items.find((item) => item.itemId === itemId);
    return { x: of(created.x)?.short, y: of(created.y)?.short };
  };
  const reservationsOfOrder = async (): Promise<string> => {
    const [row]: Array<{ total: string }> = await dataSource.query(
      `SELECT COALESCE(SUM(quantity), 0)::text AS total FROM stock_reservations WHERE order_id = $1`,
      [created.orderId],
    );
    return row.total;
  };

  /** Notices are posted after the stock change commits; the read waits for them a little. */
  const eventually = async <T>(
    read: () => Promise<T>,
    done: (value: T) => boolean,
  ): Promise<T> => {
    let value = await read();
    for (let attempt = 0; attempt < 40 && !done(value); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      value = await read();
    }
    return value;
  };
  const orderNotices = async (): Promise<OrderNotice[]> =>
    dataSource.query(
      `SELECT event_type, dedupe_key, role_codes, user_ids FROM notifications
        WHERE event_type = ANY($1) AND (payload->>'orderId')::int = $2
        ORDER BY event_type`,
      [ORDER_SHORT_EVENTS, created.orderId],
    );
  const lowNotices = async (itemId: number): Promise<LowNotice[]> =>
    dataSource.query(
      `SELECT id, status, dedupe_key FROM notifications
        WHERE event_type = $1 AND (payload->>'itemId')::int = $2`,
      [STOCK_LOW_EVENT, itemId],
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // The same filter and pipe main.ts registers, so errors reach the client as in production.
    app.useGlobalFilters(new HttpExceptionFilter(app.get(LoggerService)));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);

    for (const username of [
      'director',
      'sales_a',
      'sales_b',
      'sales_mgr',
      'engineer_a',
      'purchasing',
      'storekeeper',
    ]) {
      await login(username);
    }
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) {
      await app?.close();
      return;
    }
    const ids = (value: number) => (value ? [value] : []);
    const itemIds = [created.x, created.y].filter(Boolean);
    try {
      // Notifications name their subjects in the payload, not in a foreign key.
      const notices = `SELECT id FROM notifications
         WHERE (payload->>'orderId')::int = ANY($1)
            OR (payload->>'requestId')::int = ANY($2)
            OR (payload->>'quotationId')::int = ANY($3)
            OR (payload->>'estimateId')::int = ANY($4)
            OR (event_type = '${STOCK_LOW_EVENT}' AND (payload->>'itemId')::int = ANY($5))
            OR (payload->>'purchaseOrderId')::int = ANY($6)
            OR (payload->>'stocktakeId')::int = ANY($7)`;
      const noticeParams = [
        ids(created.orderId),
        ids(created.requestId),
        ids(created.quotationId),
        ids(created.estimateId),
        itemIds,
        ids(created.purchaseOrderId),
        ids(created.stocktakeId),
      ];
      await dataSource.query(
        `DELETE FROM notification_reads WHERE notification_id IN (${notices})`,
        noticeParams,
      );
      await dataSource.query(
        `DELETE FROM notifications WHERE id IN (${notices})`,
        noticeParams,
      );
      // Warehouse documents first: their lines name the purchase order lines and the items.
      await dataSource.query(
        `DELETE FROM stock_receipts WHERE purchase_order_id = ANY($1)`,
        [ids(created.purchaseOrderId)],
      );
      for (const table of ['stock_issues', 'stock_workshop_returns']) {
        await dataSource.query(
          `DELETE FROM ${table} WHERE order_id = ANY($1)`,
          [ids(created.orderId)],
        );
      }
      await dataSource.query(`DELETE FROM purchase_orders WHERE id = ANY($1)`, [
        ids(created.purchaseOrderId),
      ]);
      await dataSource.query(
        `DELETE FROM purchase_requests WHERE id = ANY($1)`,
        [ids(created.purchaseRequestId)],
      );
      await dataSource.query(`DELETE FROM stocktakes WHERE id = ANY($1)`, [
        ids(created.stocktakeId),
      ]);
      for (const table of [
        'stock_reservations',
        'stock_movements',
        'stock_balances',
      ]) {
        await dataSource.query(
          `DELETE FROM ${table} WHERE item_id = ANY($1::int[])`,
          [itemIds],
        );
      }
      // The sales chain that made the order.
      const requestIds = ids(created.requestId);
      for (const table of [
        'sales_orders',
        'sales_quotations',
        'sales_estimates',
        'sales_request_activities',
      ]) {
        await dataSource.query(
          `DELETE FROM ${table} WHERE request_id = ANY($1)`,
          [requestIds],
        );
      }
      await dataSource.query(`DELETE FROM sales_requests WHERE id = ANY($1)`, [
        requestIds,
      ]);
      await dataSource.query(`DELETE FROM projects WHERE id = ANY($1)`, [
        ids(created.projectId),
      ]);
      await dataSource.query(`DELETE FROM customers WHERE id = ANY($1)`, [
        ids(created.customerId),
      ]);
      // Master data last: the items name the location.
      await dataSource.query(`DELETE FROM items WHERE id = ANY($1::int[])`, [
        itemIds,
      ]);
      await dataSource.query(`DELETE FROM locations WHERE id = ANY($1)`, [
        ids(created.locationId),
      ]);
      await dataSource.query(`DELETE FROM suppliers WHERE id = ANY($1)`, [
        ids(created.supplierId),
      ]);
      await dataSource.query(`DELETE FROM user_sessions WHERE id = ANY($1)`, [
        sessionIds,
      ]);
    } finally {
      await app.close();
    }
  });

  it('buys, receives, issues and compares the material of one order', async () => {
    // Only one stock count may be open in the whole warehouse: name the one in the way rather
    // than fail on a bare 409 (it belongs to someone else, so it is left alone).
    const openCounts: Array<{ code: string }> = await dataSource.query(
      `SELECT code FROM stocktakes WHERE status IN ('counting', 'submitted')`,
    );
    expect({ openStockCounts: openCounts.map((row) => row.code) }).toEqual({
      openStockCounts: [],
    });

    // 1. Master data and the opening stock: a count of the new location, X counted 3.
    created.supplierId = (
      (
        await post('purchasing', '/inventory/suppliers', {
          code: `NCC-E2E-${tag}`,
          name: `E2E supplier ${tag}`,
        }).expect(201)
      ).body as { id: number }
    ).id;
    created.locationId = (
      (
        await post('storekeeper', '/catalog/locations', {
          code: `E2E-${tag}`,
          name: `E2E shelf ${tag}`,
        }).expect(201)
      ).body as { id: number }
    ).id;
    const createItem = async (suffix: string, referencePrice: number) =>
      (
        (
          await post('purchasing', '/items', {
            code: `E2E-${tag}-${suffix}`,
            name: `E2E ${suffix} ${tag}`,
            group: 'breaker',
            unit: 'pcs',
            referencePrice,
          }).expect(201)
        ).body as { id: number }
      ).id;
    created.x = await createItem('X', 100_000);
    created.y = await createItem('Y', 50_000);
    await patch('storekeeper', `/items/${created.x}/stock-settings`, {
      defaultLocationId: created.locationId,
      minStock: 2,
    }).expect(200);
    await patch('storekeeper', `/items/${created.y}/stock-settings`, {
      defaultLocationId: created.locationId,
    }).expect(200);

    const count = (
      await post('storekeeper', '/inventory/stocktakes', {
        scope: 'location',
        locationId: created.locationId,
      }).expect(201)
    ).body as { id: number; lines: Array<{ itemId: number }> };
    created.stocktakeId = count.id;
    expect(count.lines.map((line) => line.itemId).sort()).toEqual(
      [created.x, created.y].sort(),
    );
    await patch(
      'storekeeper',
      `/inventory/stocktakes/${count.id}/lines/${created.x}`,
      { countedQty: 3 },
    ).expect(200);
    await patch(
      'storekeeper',
      `/inventory/stocktakes/${count.id}/lines/${created.y}`,
      { countedQty: 0 },
    ).expect(200);
    await post(
      'storekeeper',
      `/inventory/stocktakes/${count.id}/submit`,
    ).expect(200);
    await post('director', `/inventory/stocktakes/${count.id}/approve`).expect(
      200,
    );
    expectNoMoneyKeys(
      (
        await get('storekeeper', `/inventory/stocktakes/${count.id}`).expect(
          200,
        )
      ).body,
    );
    await expectStock({ x: stock(3, 0), y: stock(0, 0) });

    // 2. The P1 chain to an order of Sales A whose one panel needs X 5 and Y 2.
    created.customerId = (
      (
        await post('sales_a', '/customers', {
          code: `KH_9999INV${tag}`,
          name: `E2E inventory customer ${tag}`,
          taxCode: '0101234567',
          address: '1 Demo Street, Ho Chi Minh City',
        }).expect(201)
      ).body as { id: number }
    ).id;
    created.projectId = (
      (
        await post('sales_a', '/projects', {
          code: `DA_9999INV${tag}`,
          customerId: created.customerId,
          name: `E2E inventory project ${tag}`,
          siteAddress: '2 Site Road',
        }).expect(201)
      ).body as { id: number }
    ).id;
    created.requestId = (
      (
        await post('sales_a', '/sales/requests', {
          customerId: created.customerId,
          projectId: created.projectId,
          title: `E2E inventory request ${tag}`,
        }).expect(201)
      ).body as { id: number }
    ).id;
    await post('sales_a', `/sales/requests/${created.requestId}/assign`, {
      engineerId: sessions.get('engineer_a')?.userId,
    }).expect(200);
    created.estimateId = (
      (
        await post('engineer_a', '/sales/estimates', {
          requestId: created.requestId,
        }).expect(201)
      ).body as { id: number }
    ).id;
    const panelId = (
      (
        await post(
          'engineer_a',
          `/sales/estimates/${created.estimateId}/panels`,
          { tag: 'MSB-01', description: 'Main switchboard', quantity: 1 },
        ).expect(201)
      ).body as { panels: Array<{ id: number }> }
    ).panels[0].id;
    const bomLineIds: number[] = [];
    for (const [itemId, quantity] of [
      [created.x, 5],
      [created.y, 2],
    ]) {
      const withLine = await post(
        'engineer_a',
        `/sales/estimates/${created.estimateId}/panels/${panelId}/bom-lines`,
        { itemId, quantity },
      ).expect(201);
      const lines = (
        withLine.body as { panels: Array<{ bomLines: Array<{ id: number }> }> }
      ).panels[0].bomLines;
      bomLineIds.push(lines[lines.length - 1].id);
    }
    await post(
      'engineer_a',
      `/sales/estimates/${created.estimateId}/submit`,
    ).expect(200);
    // The engineer sends quantities only: sales fills the unit costs and marks the estimate priced.
    for (const [index, unitCost] of [100_000, 50_000].entries()) {
      await patch(
        'sales_a',
        `/sales/estimates/${created.estimateId}/bom-lines/${bomLineIds[index]}/unit-cost`,
        { unitCost },
      ).expect(200);
    }
    await post(
      'sales_a',
      `/sales/estimates/${created.estimateId}/price`,
    ).expect(200);
    created.quotationId = (
      (
        await post('sales_a', '/sales/quotations', {
          requestId: created.requestId,
        }).expect(201)
      ).body as { id: number }
    ).id;
    await post(
      'sales_a',
      `/sales/quotations/${created.quotationId}/submit`,
    ).expect(200);
    await post(
      'sales_mgr',
      `/sales/quotations/${created.quotationId}/approve`,
    ).expect(200);
    await post(
      'sales_a',
      `/sales/quotations/${created.quotationId}/confirm`,
    ).expect(200);
    const order = (
      await post('sales_a', '/sales/orders', {
        quotationId: created.quotationId,
        deliveryDate: '2027-03-01',
      }).expect(201)
    ).body as { id: number; code: string };
    created.orderId = order.id;

    // The order reserves the 3 X on hand; X is now below its minimum of 2.
    await expectStock({ x: stock(3, 3), y: stock(0, 0) });
    expect(await shortOf()).toEqual({ x: 2, y: 2 });
    const raised = await eventually(orderNotices, (rows) => rows.length >= 2);
    expect(raised).toEqual([
      {
        event_type: 'inventory.order.short',
        dedupe_key: `order:${created.orderId}`,
        role_codes: ['purchasing', 'productionManager'],
        user_ids: [],
      },
      {
        event_type: 'inventory.order.short.owner',
        dedupe_key: `order:${created.orderId}`,
        role_codes: [],
        user_ids: [sessions.get('sales_a')?.userId],
      },
    ]);
    expect(
      await eventually(
        () => lowNotices(created.x),
        (rows) => rows.length >= 1,
      ),
    ).toHaveLength(1);

    // 3. Purchasing requests the shortage and buys it, plus one X for stock.
    const purchaseRequest = (
      await post(
        'purchasing',
        `/inventory/purchase-requests/from-order/${created.orderId}`,
      ).expect(201)
    ).body as {
      id: number;
      lines: Array<{
        id: number;
        itemId: number;
        quantity: number;
        sourceOrderId: number;
      }>;
    };
    created.purchaseRequestId = purchaseRequest.id;
    const requested = (itemId: number) => {
      const line = purchaseRequest.lines.find((row) => row.itemId === itemId);
      if (!line) throw new Error(`No request line for item ${itemId}`);
      return line;
    };
    expect(requested(created.x)).toMatchObject({
      quantity: 2,
      sourceOrderId: created.orderId,
    });
    expect(requested(created.y)).toMatchObject({
      quantity: 2,
      sourceOrderId: created.orderId,
    });
    const draft = (
      await post('purchasing', '/inventory/purchase-orders/from-requests', {
        supplierId: created.supplierId,
        lines: [
          { prLineId: requested(created.x).id, quantity: 2 },
          { prLineId: requested(created.y).id, quantity: 2 },
        ],
      }).expect(201)
    ).body as PurchaseOrderBody;
    created.purchaseOrderId = draft.id;
    expect(draft.status).toBe('draft');
    const withStockLine = (
      await patch('purchasing', `/inventory/purchase-orders/${draft.id}`, {
        lines: [
          ...draft.lines.map(({ itemId, quantity, unitPrice }) => ({
            itemId,
            quantity,
            unitPrice,
          })),
          { itemId: created.x, quantity: 1, unitPrice: 98_000 },
        ],
      }).expect(200)
    ).body as PurchaseOrderBody;
    expect(withStockLine.lines).toHaveLength(3);
    const [linkedSources]: Array<{ linked: number; own: number }> =
      await dataSource.query(
        `SELECT COUNT(*) FILTER (WHERE source_order_id = $2)::int AS linked,
                COUNT(*) FILTER (WHERE source_order_id IS NULL AND pr_line_id IS NULL)::int AS own
           FROM purchase_order_lines WHERE purchase_order_id = $1`,
        [draft.id, created.orderId],
      );
    expect(linkedSources).toEqual({ linked: 2, own: 1 });
    await post(
      'purchasing',
      `/inventory/purchase-orders/${draft.id}/submit`,
    ).expect(200);
    await post(
      'purchasing',
      `/inventory/purchase-orders/${draft.id}/approve`,
    ).expect(403);
    await post(
      'director',
      `/inventory/purchase-orders/${draft.id}/approve`,
    ).expect(200);

    // 4. The storekeeper reads the order without a price and receives it in two goes.
    const seen = (
      await get('storekeeper', `/inventory/purchase-orders/${draft.id}`).expect(
        200,
      )
    ).body as PurchaseOrderBody;
    expectNoMoneyKeys(seen);
    const poLine = (itemId: number, own: boolean) => {
      const ids = new Set(
        draft.lines
          .filter((line) => line.itemId === itemId)
          .map((line) => line.id),
      );
      const line = seen.lines.find(
        (row) => row.itemId === itemId && ids.has(row.id) !== own,
      );
      if (!line) throw new Error(`No PO line for item ${itemId}`);
      return line.id;
    };
    const receive = (lines: Array<{ poLineId: number; quantity: number }>) =>
      post('storekeeper', '/inventory/receipts', {
        purchaseOrderId: draft.id,
        lines,
      });
    await receive([
      { poLineId: poLine(created.x, false), quantity: 1 },
      { poLineId: poLine(created.y, false), quantity: 2 },
    ]).expect(201);
    const partly = (
      await get('purchasing', `/inventory/purchase-orders/${draft.id}`).expect(
        200,
      )
    ).body as PurchaseOrderBody;
    expect(partly.status).toBe('partially_received');
    // Both went to the order they were bought for.
    await expectStock({ x: stock(4, 4), y: stock(2, 2) });
    expect(await shortOf()).toEqual({ x: 1, y: 0 });
    // More than the line has left is refused while the order is still being received.
    const overReceived = await receive([
      { poLineId: poLine(created.x, false), quantity: 2 },
    ]).expect(409);
    expect(JSON.stringify(overReceived.body)).toContain(
      'only 1 remain to be received',
    );
    await expectStock({ x: stock(4, 4), y: stock(2, 2) });

    await receive([
      { poLineId: poLine(created.x, false), quantity: 1 },
      { poLineId: poLine(created.x, true), quantity: 1 },
    ]).expect(201);
    const received = (
      await get('purchasing', `/inventory/purchase-orders/${draft.id}`).expect(
        200,
      )
    ).body as PurchaseOrderBody;
    expect(received.status).toBe('received');
    // The order is covered; the stock line's X stays free.
    await expectStock({ x: stock(6, 5), y: stock(2, 2) });
    expect(await shortOf()).toEqual({ x: 0, y: 0 });
    const released = await eventually(orderNotices, (rows) =>
      rows.every((row) => row.dedupe_key === null),
    );
    expect(released).toHaveLength(2);
    expect(released.map((row) => row.dedupe_key)).toEqual([null, null]);
    await receive([{ poLineId: poLine(created.x, true), quantity: 1 }]).expect(
      409,
    );

    // 5. Issues to the workshop: the BOM first, then one X beyond it, which needs a reason.
    const issue = (
      lines: Array<{ itemId: number; quantity: number; reason?: string }>,
    ) =>
      post('storekeeper', '/inventory/issues', {
        orderId: created.orderId,
        lines,
      });
    const firstIssue = (
      await issue([
        { itemId: created.x, quantity: 5 },
        { itemId: created.y, quantity: 2 },
      ]).expect(201)
    ).body as { id: number };
    expect(await reservationsOfOrder()).toBe('0');
    await expectStock({ x: stock(1, 0), y: stock(0, 0) });
    const withoutReason = await issue([
      { itemId: created.x, quantity: 1 },
    ]).expect(400);
    expect(JSON.stringify(withoutReason.body)).toContain('needs a reason');
    await issue([
      { itemId: created.x, quantity: 1, reason: 'thay thế' },
    ]).expect(201);
    await expectStock({ x: stock(0, 0), y: stock(0, 0) });

    // 6. The workshop returns one X: the order's net issue equals its demand again, so nothing
    // is reserved back.
    const workshopReturn = (
      await post('storekeeper', '/inventory/workshop-returns', {
        orderId: created.orderId,
        lines: [{ itemId: created.x, quantity: 1 }],
      }).expect(201)
    ).body as { id: number };
    await expectStock({ x: stock(1, 0), y: stock(0, 0) });
    expect(await reservationsOfOrder()).toBe('0');
    const view = await material();
    expect(view.items.find((item) => item.itemId === created.x)).toMatchObject({
      demand: 5,
      reserved: 0,
      // Net issued 6 − 1 = 5, the demand.
      issued: 6,
      returned: 1,
      short: 0,
    });

    const report = (
      await get(
        'director',
        `/inventory/materials/orders/${created.orderId}/estimate-vs-actual`,
      ).expect(200)
    ).body as {
      items: Array<{ itemId: number; estimatedQty: number; actualQty: number }>;
      overBomIssues: Array<{
        itemId: number;
        quantity: number;
        reason: string;
      }>;
    };
    expect(
      report.items.find((item) => item.itemId === created.x),
    ).toMatchObject({
      estimatedQty: 5,
      actualQty: 5,
    });
    expect(report.overBomIssues).toEqual([
      expect.objectContaining({
        itemId: created.x,
        quantity: 1,
        reason: 'thay thế',
      }),
    ]);

    await get(
      'sales_b',
      `/inventory/materials/orders/${created.orderId}`,
    ).expect(404);
    const salesBList = (
      await get(
        'sales_b',
        `/inventory/materials/orders?search=${encodeURIComponent(order.code)}`,
      ).expect(200)
    ).body as { data: Array<{ id: number }> };
    expect(salesBList.data.map((row) => row.id)).not.toContain(created.orderId);
    await get(
      'engineer_a',
      `/inventory/materials/orders/${created.orderId}`,
    ).expect(403);
    await get('engineer_a', '/inventory/stock').expect(403);
    const engineerStock = (
      await get(
        'engineer_a',
        `/inventory/stock/availability?itemIds=${created.x},${created.y}`,
      ).expect(200)
    ).body as unknown;
    expectNoMoneyKeys(engineerStock);

    // X stayed below its minimum from the order's reservation on: one low-stock notice.
    const low = await lowNotices(created.x);
    expect(low).toHaveLength(1);
    expect(low[0]).toMatchObject({
      status: 'open',
      dedupe_key: `item:${created.x}`,
    });
    expect(await lowNotices(created.y)).toEqual([]);

    // 7. No price in anything served to the storekeeper, Sales A or the engineer.
    const receiptIds: Array<{ id: number }> = await dataSource.query(
      `SELECT id FROM stock_receipts WHERE purchase_order_id = $1 ORDER BY id`,
      [draft.id],
    );
    const storekeeperReads = [
      `/items?search=${tag}`,
      `/items/${created.x}`,
      `/items/resolve?code=${encodeURIComponent(`E2E-${tag}-X`)}`,
      `/inventory/stock?search=${tag}`,
      `/inventory/stock/${created.x}/movements`,
      '/inventory/purchase-orders',
      `/inventory/purchase-orders/${draft.id}`,
      '/inventory/receipts',
      ...receiptIds.map(({ id }) => `/inventory/receipts/${id}`),
      '/inventory/issues',
      `/inventory/issues/${firstIssue.id}`,
      '/inventory/workshop-returns',
      `/inventory/workshop-returns/${workshopReturn.id}`,
      '/inventory/stocktakes',
      `/inventory/stocktakes/${count.id}`,
      '/inventory/materials/orders',
      `/inventory/materials/orders/${created.orderId}`,
      `/inventory/materials/orders/${created.orderId}/estimate-vs-actual`,
    ];
    for (const path of storekeeperReads) {
      const res = await get('storekeeper', path);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
      expectNoMoneyKeys(res.body);
    }
    for (const path of [
      `/inventory/stock/availability?itemIds=${created.x},${created.y}`,
      '/inventory/materials/orders',
      `/inventory/materials/orders/${created.orderId}`,
      `/inventory/materials/orders/${created.orderId}/estimate-vs-actual`,
    ]) {
      const res = await get('sales_a', path);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
      expectNoMoneyKeys(res.body);
    }

    // 8. The ledger adds up: movements to the balance, reservations to its reserved.
    const ledger: Array<{
      item_id: number;
      moved: string;
      on_hand: string;
      moved_value: string;
      value: string;
      reserved: string;
      reservations: string;
    }> = await dataSource.query(
      `SELECT b.item_id,
              (SELECT COALESCE(SUM(m.quantity), 0) FROM stock_movements m WHERE m.item_id = b.item_id)::text AS moved,
              b.on_hand::text AS on_hand,
              (SELECT COALESCE(SUM(m.value), 0) FROM stock_movements m WHERE m.item_id = b.item_id)::text AS moved_value,
              b.value::text AS value,
              b.reserved::text AS reserved,
              (SELECT COALESCE(SUM(r.quantity), 0) FROM stock_reservations r WHERE r.item_id = b.item_id)::text AS reservations
         FROM stock_balances b WHERE b.item_id = ANY($1::int[]) ORDER BY b.item_id`,
      [[created.x, created.y]],
    );
    expect(ledger).toHaveLength(2);
    for (const row of ledger) {
      expect(Number(row.moved)).toBe(Number(row.on_hand));
      expect(Number(row.moved_value)).toBe(Number(row.value));
      expect(Number(row.reservations)).toBe(Number(row.reserved));
    }
  });
});
