import { randomBytes } from 'crypto';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { HttpExceptionFilter } from '@kernel/shared/filters/http-exception.filter';
import { LoggerService } from '@kernel/shared/logger/logger.service';

import { validationExceptionFactory } from '@shared/utils/validation-error.util';

import { AppModule } from '@src/app.module';

import type { App } from 'supertest/types';

jest.setTimeout(120_000);

interface Session {
  token: string;
  userId: number;
}

interface Line {
  id: number;
  tag: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  bomLines: Array<{
    id: number;
    itemCode: string;
    itemName: string;
    itemUnit: string;
    quantity: number;
  }>;
}

interface Totals {
  subtotal: number;
  discountAmount: number;
  taxable: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

/**
 * The sales chain over HTTP against the compose Postgres: customer, project and catalog item
 * → request → assignment → estimate with a panel and its BOM → quotation with a margin →
 * approval by someone other than the editor → customer confirmation → order. Every actor is a
 * seeded demo account (the password is the environment's SEED_ADMIN_PASSWORD); every row the
 * run creates is removed by id in `afterAll`.
 */
describe('Sales chain (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const tag = randomBytes(4).toString('hex');

  const sessions = new Map<string, Session>();
  /** Sessions this run opened by signing in, read from the `sid` claim of each token. */
  const sessionIds: number[] = [];
  const created = {
    customerId: 0,
    projectId: 0,
    itemId: 0,
    requestId: 0,
    estimateId: 0,
    quotationId: 0,
    orderId: 0,
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
    const body = res.body as {
      accessToken: string;
      user: { id: number };
    };
    sessions.set(username, { token: body.accessToken, userId: body.user.id });
    const claims = JSON.parse(
      Buffer.from(body.accessToken.split('.')[1], 'base64url').toString(),
    ) as { sid?: number };
    if (typeof claims.sid === 'number') sessionIds.push(claims.sid);
  };

  const orderState = async () => {
    const [order]: Array<{ id: number; status: string; total: string }> =
      await dataSource.query(
        `SELECT id, status, total FROM sales_orders WHERE quotation_id = $1`,
        [created.quotationId],
      );
    const lines: Array<{ tag: string; quantity: number; amount: string }> =
      await dataSource.query(
        `SELECT tag, quantity, amount FROM sales_order_lines WHERE order_id = $1 ORDER BY id`,
        [created.orderId],
      );
    return { order, lines };
  };

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
      'sales_a',
      'sales_b',
      'sales_mgr',
      'engineer_a',
      'purchasing',
    ]) {
      await login(username);
    }
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) {
      await app?.close();
      return;
    }
    try {
      const requestIds = created.requestId ? [created.requestId] : [];
      const quotationIds = created.quotationId ? [created.quotationId] : [];
      // Notifications name their documents in the payload, not in a foreign key.
      await dataSource.query(
        `DELETE FROM notification_reads WHERE notification_id IN (
           SELECT id FROM notifications
           WHERE (payload->>'requestId')::int = ANY($1)
              OR (payload->>'quotationId')::int = ANY($2)
              OR (payload->>'estimateId')::int = ANY($3)
              OR (payload->>'orderId')::int = ANY($4))`,
        [
          requestIds,
          quotationIds,
          created.estimateId ? [created.estimateId] : [],
          created.orderId ? [created.orderId] : [],
        ],
      );
      await dataSource.query(
        `DELETE FROM notifications
         WHERE (payload->>'requestId')::int = ANY($1)
            OR (payload->>'quotationId')::int = ANY($2)
            OR (payload->>'estimateId')::int = ANY($3)
            OR (payload->>'orderId')::int = ANY($4)`,
        [
          requestIds,
          quotationIds,
          created.estimateId ? [created.estimateId] : [],
          created.orderId ? [created.orderId] : [],
        ],
      );
      await dataSource.query(
        `DELETE FROM sales_orders WHERE request_id = ANY($1)`,
        [requestIds],
      );
      await dataSource.query(
        `DELETE FROM sales_quotations WHERE request_id = ANY($1)`,
        [requestIds],
      );
      await dataSource.query(
        `DELETE FROM sales_estimates WHERE request_id = ANY($1)`,
        [requestIds],
      );
      await dataSource.query(
        `DELETE FROM sales_request_activities WHERE request_id = ANY($1)`,
        [requestIds],
      );
      await dataSource.query(`DELETE FROM sales_requests WHERE id = ANY($1)`, [
        requestIds,
      ]);
      if (created.projectId) {
        await dataSource.query(`DELETE FROM projects WHERE id = $1`, [
          created.projectId,
        ]);
      }
      if (created.customerId) {
        await dataSource.query(`DELETE FROM customers WHERE id = $1`, [
          created.customerId,
        ]);
      }
      if (created.itemId) {
        await dataSource.query(`DELETE FROM items WHERE id = $1`, [
          created.itemId,
        ]);
      }
      await dataSource.query(`DELETE FROM user_sessions WHERE id = ANY($1)`, [
        sessionIds,
      ]);
    } finally {
      await app.close();
    }
  });

  it('runs a request through estimate, quotation and approval to an order', async () => {
    // Master data: Sales A owns the customer, Purchasing keeps the catalog.
    const customer = await post('sales_a', '/customers', {
      code: `KH_9999E2E${tag}`,
      name: `E2E customer ${tag}`,
      taxCode: '0101234567',
      address: '1 Demo Street, Ho Chi Minh City',
    }).expect(201);
    created.customerId = (customer.body as { id: number }).id;
    const project = await post('sales_a', '/projects', {
      code: `DA_9999E2E${tag}`,
      customerId: created.customerId,
      name: `E2E project ${tag}`,
      siteAddress: '2 Site Road',
    }).expect(201);
    created.projectId = (project.body as { id: number }).id;
    const item = await post('purchasing', '/items', {
      code: `E2E-${tag}`,
      name: `E2E breaker ${tag}`,
      brand: 'Demo',
      group: 'breaker',
      unit: 'pcs',
      referencePrice: 1000,
    }).expect(201);
    created.itemId = (item.body as { id: number }).id;

    // Request by Sales A, assigned to Engineer A.
    const req = await post('sales_a', '/sales/requests', {
      customerId: created.customerId,
      projectId: created.projectId,
      title: `E2E request ${tag}`,
    }).expect(201);
    created.requestId = (req.body as { id: number }).id;
    await post('sales_a', `/sales/requests/${created.requestId}/assign`, {
      engineerId: sessions.get('engineer_a')?.userId,
    }).expect(200);

    // Estimate: one panel with one BOM line, submitted by the engineer.
    const estimate = await post('engineer_a', '/sales/estimates', {
      requestId: created.requestId,
    }).expect(201);
    created.estimateId = (estimate.body as { id: number }).id;
    const withPanel = await post(
      'engineer_a',
      `/sales/estimates/${created.estimateId}/panels`,
      { tag: 'MSB-01', description: 'Main switchboard', quantity: 2 },
    ).expect(201);
    const panelId = (withPanel.body as { panels: Array<{ id: number }> })
      .panels[0].id;
    await post(
      'engineer_a',
      `/sales/estimates/${created.estimateId}/panels/${panelId}/bom-lines`,
      { itemId: created.itemId, quantity: 3, unitCost: 1_000_000 },
    ).expect(201);
    await post(
      'engineer_a',
      `/sales/estimates/${created.estimateId}/submit`,
    ).expect(200);
    expect(
      (
        (await get('sales_a', `/sales/requests/${created.requestId}`)).body as {
          status: string;
        }
      ).status,
    ).toBe('estimated');

    // Quotation by Sales A with a 20% margin, submitted for approval.
    const quotation = await post('sales_a', '/sales/quotations', {
      requestId: created.requestId,
    }).expect(201);
    created.quotationId = (quotation.body as { id: number }).id;
    const lineId = (
      quotation.body as { current: { lines: Array<{ id: number }> } }
    ).current.lines[0].id;
    await patch('sales_a', `/sales/quotations/${created.quotationId}`, {
      lines: [{ lineId, marginPercent: 20 }],
    }).expect(200);
    await post(
      'sales_a',
      `/sales/quotations/${created.quotationId}/submit`,
    ).expect(200);

    // The creator cannot approve; the sales manager can, then the customer confirms.
    await post(
      'sales_a',
      `/sales/quotations/${created.quotationId}/approve`,
    ).expect(403);
    await post(
      'sales_mgr',
      `/sales/quotations/${created.quotationId}/approve`,
    ).expect(200);
    await post(
      'sales_a',
      `/sales/quotations/${created.quotationId}/confirm`,
    ).expect(200);
    const confirmed = (
      await get('sales_a', `/sales/quotations/${created.quotationId}`).expect(
        200,
      )
    ).body as {
      current: Totals & { status: string; lines: Line[]; terms: string[] };
    };
    expect(confirmed.current.status).toBe('customer_confirmed');
    expect(confirmed.current.lines).toHaveLength(1);
    expect(confirmed.current.total).toBeGreaterThan(0);

    // Convert: Sales B cannot see it, the engineer cannot convert, Sales A can.
    await post('sales_b', '/sales/orders', {
      quotationId: created.quotationId,
    }).expect(404);
    await post('engineer_a', '/sales/orders', {
      quotationId: created.quotationId,
    }).expect(403);
    const order = await post('sales_a', '/sales/orders', {
      quotationId: created.quotationId,
      contractNo: ` HD-${tag} `,
      deliveryDate: '2027-03-01',
    }).expect(201);
    const orderBody = order.body as Totals & {
      id: number;
      code: string;
      status: string;
      customerName: string;
      customerTaxCode: string;
      customerAddress: string;
      projectName: string;
      contractNo: string;
      deliveryDate: string;
      terms: string[];
      lines: Line[];
      chain: {
        request: { id: number };
        estimate: { id: number };
        quotation: { id: number; ver: number };
      };
    };
    created.orderId = orderBody.id;

    expect(orderBody.code).toMatch(/^DH_\d{4}_\d{4}$/);
    expect(orderBody).toMatchObject({
      status: 'open',
      customerName: `E2E customer ${tag}`,
      customerTaxCode: '0101234567',
      customerAddress: '1 Demo Street, Ho Chi Minh City',
      projectName: `E2E project ${tag}`,
      contractNo: `HD-${tag}`,
      deliveryDate: '2027-03-01',
      chain: {
        request: { id: created.requestId },
        estimate: { id: created.estimateId },
        quotation: { id: created.quotationId, ver: 1 },
      },
    });
    const withoutId = ({ id: _id, ...rest }: Line['bomLines'][number]) => rest;
    // Lines and totals equal the confirmed version's, figure for figure.
    const pick = ({ tag: lineTag, quantity, unitPrice, amount }: Line) => ({
      tag: lineTag,
      quantity,
      unitPrice,
      amount,
    });
    expect(orderBody.lines.map(pick)).toEqual(
      confirmed.current.lines.map(pick),
    );
    expect(orderBody.lines[0].bomLines.map(withoutId)).toEqual(
      confirmed.current.lines[0].bomLines.map(withoutId),
    );
    for (const key of [
      'subtotal',
      'discountAmount',
      'taxable',
      'vatRate',
      'vatAmount',
      'total',
    ] as const) {
      expect(orderBody[key]).toBe(confirmed.current[key]);
    }
    expect(orderBody.terms).toEqual(confirmed.current.terms);
    expect(orderBody.terms.length).toBeGreaterThan(0);

    // The request is won; Sales B reads neither the order nor its list entry.
    expect(
      (
        (await get('sales_a', `/sales/requests/${created.requestId}`)).body as {
          status: string;
        }
      ).status,
    ).toBe('won');
    await get('sales_b', `/sales/orders/${created.orderId}`).expect(404);
    const listed = (await get('sales_b', '/sales/orders').expect(200)).body as {
      data: Array<{ id: number }>;
    };
    expect(listed.data.map((row) => row.id)).not.toContain(created.orderId);
    await get('engineer_a', `/sales/orders/${created.orderId}`).expect(403);

    // A confirmed version is final: revising it, converting it again or closing the request
    // all answer 409.
    await post(
      'sales_a',
      `/sales/quotations/${created.quotationId}/revise`,
    ).expect(409);
    await post('sales_a', '/sales/orders', {
      quotationId: created.quotationId,
    }).expect(409);
    await post('sales_a', `/sales/requests/${created.requestId}/lost`, {
      reason: 'No',
    }).expect(409);

    // Counterexample: the order holds copies, not references. Later edit attempts on the
    // quotation and the estimate change nothing in it, and rewriting the quotation's own rows
    // underneath leaves the order's lines and totals as they were.
    await patch('sales_a', `/sales/quotations/${created.quotationId}`, {
      lines: [{ lineId, marginPercent: 90 }],
    }).expect(409);
    await post(
      'engineer_a',
      `/sales/estimates/${created.estimateId}/revise`,
    ).expect(409);
    await patch(
      'engineer_a',
      `/sales/estimates/${created.estimateId}/panels/${panelId}`,
      { quantity: 9 },
    ).expect(409);
    await dataSource.query(
      `UPDATE sales_quotation_lines SET quantity = 77, unit_price = 1, amount = 1
       WHERE version_id IN (SELECT id FROM sales_quotation_versions WHERE quotation_id = $1)`,
      [created.quotationId],
    );
    await dataSource.query(
      `UPDATE sales_quotation_bom_lines SET item_name = 'Changed item', quantity = 99
       WHERE line_id IN (
         SELECT l.id FROM sales_quotation_lines l
         JOIN sales_quotation_versions v ON v.id = l.version_id
         WHERE v.quotation_id = $1)`,
      [created.quotationId],
    );
    await dataSource.query(
      `UPDATE customers SET name = 'Renamed after order' WHERE id = $1`,
      [created.customerId],
    );

    const after = (
      await get('sales_a', `/sales/orders/${created.orderId}`).expect(200)
    ).body as typeof orderBody;
    expect(after.lines.map(pick)).toEqual(confirmed.current.lines.map(pick));
    expect(after.lines[0].bomLines.map(withoutId)).toEqual(
      confirmed.current.lines[0].bomLines.map(withoutId),
    );
    expect(after.total).toBe(confirmed.current.total);
    expect(after.customerName).toBe(`E2E customer ${tag}`);
    const stored = await orderState();
    expect(stored.lines).toHaveLength(1);
    expect(stored.lines[0].quantity).toBe(confirmed.current.lines[0].quantity);

    // Header fields edit while open: the sales owner may, another sales account is out of
    // scope.
    await patch('sales_b', `/sales/orders/${created.orderId}`, {
      contractNo: 'X',
    }).expect(404);
    await patch('sales_a', `/sales/orders/${created.orderId}`, {
      deliveryDate: '2027-03-05',
    }).expect(200);
    await patch('sales_mgr', `/sales/orders/${created.orderId}`, {
      contractDate: '2027-01-20',
      total: 1,
    }).expect(400);
    const edited = await patch(
      'sales_mgr',
      `/sales/orders/${created.orderId}`,
      {
        contractDate: '2027-01-20',
      },
    ).expect(200);
    expect(edited.body).toMatchObject({
      contractDate: '2027-01-20',
      contractNo: `HD-${tag}`,
    });

    // Cancelling needs order:cancel and a reason, and sends the request to lost.
    await post('sales_a', `/sales/orders/${created.orderId}/cancel`, {
      reason: 'x',
    }).expect(403);
    await post(
      'sales_mgr',
      `/sales/orders/${created.orderId}/cancel`,
      {},
    ).expect(400);
    await post('sales_mgr', `/sales/orders/${created.orderId}/cancel`, {
      reason: 'Customer withdrew',
    }).expect(200);
    expect(
      (
        (await get('sales_a', `/sales/requests/${created.requestId}`)).body as {
          status: string;
        }
      ).status,
    ).toBe('lost');
    await post('sales_a', '/sales/orders', {
      quotationId: created.quotationId,
    }).expect(409);
    await patch('sales_mgr', `/sales/orders/${created.orderId}`, {
      contractNo: 'Y',
    }).expect(409);
  });
});
