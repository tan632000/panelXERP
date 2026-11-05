import { randomBytes } from 'crypto';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { HttpExceptionFilter } from '@kernel/shared/filters/http-exception.filter';
import { LoggerService } from '@kernel/shared/logger/logger.service';
import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import { S3StorageService } from '@shared/services/s3-storage.service';
import { validationExceptionFactory } from '@shared/utils/validation-error.util';

import { AppModule } from '@src/app.module';

import { vnToday } from '@plugins/production/_shared/utils/vn-today.util';
import { OverdueService } from '@plugins/production/progress/services/overdue.service';

import type { App } from 'supertest/types';

/** A Vietnamese calendar date `days` away from today, so the plan never ages into the past. */
function daysFromToday(days: number): string {
  const date = new Date(`${vnToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

jest.setTimeout(180_000);

interface Session {
  token: string;
  userId: number;
}

interface UnitView {
  id: number;
  code: string;
  assigneeId: number | null;
  plannedEndDate: string | null;
}

interface ProductionOrderBody {
  id: number;
  code: string;
  status: string;
  unitCount: number;
  units: UnitView[];
}

interface ProgressUnitBody {
  id: number;
  code: string;
  productionOrderStatus: string;
  doneCount: number;
  currentStage: string | null;
  stages: Array<{ stage: string; status: string }>;
}

interface Page<T> {
  data: T[];
  meta: { total: number };
}

interface Notice {
  id: number;
  eventType: string;
  payload: Record<string, unknown>;
}

interface PurchaseOrderBody {
  id: number;
  lines: Array<{ id: number }>;
}

const STAGES = [
  'material_prep',
  'enclosure',
  'device_mounting',
  'wiring',
  'internal_test',
  'finishing',
] as const;

/** A 1x1 PNG: the signature and chunks of a real image, not a stand-in for one. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const OVERDUE_EVENTS = [
  'production.unit.overdue',
  'production.unit.overdue.assignee',
];

/**
 * The production chain over HTTP against the compose Postgres and object storage, every actor
 * a seeded demo account: a converted order of two cabinets, a production order assigned to two
 * technicians and released, stock issued to the order while it is in production, six stages of
 * each cabinet with a photo and a reported problem, the manager closing the problem, and the
 * production order completing. On the way it checks who reads what (a technician sees only his
 * own cabinets), who is told, that the overdue pass tells the manager and the assignee once,
 * and that no price reaches a production reader. Every row the run creates is removed by id in
 * `afterAll`.
 */
describe('Production chain (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const tag = randomBytes(4).toString('hex');

  const sessions = new Map<string, Session>();
  const sessionIds: number[] = [];
  const created = {
    supplierId: 0,
    itemId: 0,
    customerId: 0,
    projectId: 0,
    requestId: 0,
    estimateId: 0,
    quotationId: 0,
    orderId: 0,
    purchaseOrderId: 0,
  };

  const server = () => app.getHttpServer();
  const auth = (user: string) => {
    const session = sessions.get(user);
    if (!session) throw new Error(`${user} is not signed in`);
    return { Authorization: `Bearer ${session.token}` };
  };
  const userId = (user: string) => {
    const session = sessions.get(user);
    if (!session) throw new Error(`${user} is not signed in`);
    return session.userId;
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

  /** A read that must succeed and carry no price. */
  const readClean = async (user: string, path: string) => {
    const res = await get(user, path);
    expect({ user, path, status: res.status }).toEqual({
      user,
      path,
      status: 200,
    });
    expectNoMoneyKeys(res.body);
    return res.body as unknown;
  };

  /** Notices are posted after the change commits; the read waits for them a little. */
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

  /** The notices of one event type this user can read, found through the user's own list. */
  const noticesOf = async (
    user: string,
    eventTypes: string[],
    match: (payload: Record<string, unknown>) => boolean,
  ): Promise<Notice[]> => {
    const found: Notice[] = [];
    let cursor: number | null = null;
    do {
      const res = await get(
        user,
        `/notifications?limit=100${cursor ? `&cursor=${cursor}` : ''}`,
      ).expect(200);
      const body = res.body as { data: Notice[]; nextCursor: number | null };
      found.push(
        ...body.data.filter(
          (notice) =>
            eventTypes.includes(notice.eventType) && match(notice.payload),
        ),
      );
      cursor = body.nextCursor;
    } while (cursor !== null);
    return found;
  };
  const noticesOfOrder = (
    user: string,
    eventType: string,
    productionOrderId: number,
  ) =>
    eventually(
      () =>
        noticesOf(
          user,
          [eventType],
          (payload) => payload.productionOrderId === productionOrderId,
        ),
      (rows) => rows.length > 0,
    );
  const noticesOfUnit = (user: string, unitId: number) =>
    noticesOf(user, OVERDUE_EVENTS, (payload) => payload.unitId === unitId);

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
      'production_manager',
      'technician_a',
      'technician_b',
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
    let photos: Array<{ storage_key: string }> = [];
    try {
      const productionOrders = `SELECT id FROM production_orders WHERE order_id = ANY($1)`;
      const units = `SELECT id FROM production_units WHERE production_order_id IN (${productionOrders})`;
      const orderParams = [ids(created.orderId)];

      // Photos live in object storage as well as in a row.
      photos = await dataSource.query(
        `SELECT storage_key FROM production_unit_photos WHERE unit_id IN (${units})`,
        orderParams,
      );
      // Notifications name their subjects in the payload, not in a foreign key.
      const notices = `SELECT id FROM notifications
         WHERE (payload->>'orderId')::int = ANY($1)
            OR (payload->>'requestId')::int = ANY($2)
            OR (payload->>'quotationId')::int = ANY($3)
            OR (payload->>'estimateId')::int = ANY($4)
            OR (payload->>'purchaseOrderId')::int = ANY($5)
            OR ((payload->>'unitId')::int IN (${units}))`;
      const noticeParams = [
        ids(created.orderId),
        ids(created.requestId),
        ids(created.quotationId),
        ids(created.estimateId),
        ids(created.purchaseOrderId),
      ];
      await dataSource.query(
        `DELETE FROM notification_reads WHERE notification_id IN (${notices})`,
        noticeParams,
      );
      await dataSource.query(
        `DELETE FROM notifications WHERE id IN (${notices})`,
        noticeParams,
      );

      // Production rows first: they name the order, the unit and each other.
      await dataSource.query(
        `DELETE FROM production_unit_photos WHERE unit_id IN (${units})`,
        orderParams,
      );
      await dataSource.query(
        `DELETE FROM production_issues WHERE unit_id IN (${units})`,
        orderParams,
      );
      await dataSource.query(
        `DELETE FROM production_unit_stages WHERE unit_id IN (${units})`,
        orderParams,
      );
      await dataSource.query(
        `DELETE FROM production_order_events WHERE production_order_id IN (${productionOrders})`,
        orderParams,
      );
      await dataSource.query(
        `DELETE FROM production_units WHERE production_order_id IN (${productionOrders})`,
        orderParams,
      );
      await dataSource.query(
        `DELETE FROM production_orders WHERE order_id = ANY($1)`,
        orderParams,
      );

      // Warehouse documents: their lines name the purchase order lines and the item.
      await dataSource.query(
        `DELETE FROM stock_receipts WHERE purchase_order_id = ANY($1)`,
        [ids(created.purchaseOrderId)],
      );
      await dataSource.query(
        `DELETE FROM stock_issues WHERE order_id = ANY($1)`,
        [ids(created.orderId)],
      );
      await dataSource.query(`DELETE FROM purchase_orders WHERE id = ANY($1)`, [
        ids(created.purchaseOrderId),
      ]);
      for (const table of [
        'stock_reservations',
        'stock_movements',
        'stock_balances',
      ]) {
        await dataSource.query(
          `DELETE FROM ${table} WHERE item_id = ANY($1::int[])`,
          [ids(created.itemId)],
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
      await dataSource.query(`DELETE FROM items WHERE id = ANY($1::int[])`, [
        ids(created.itemId),
      ]);
      await dataSource.query(`DELETE FROM suppliers WHERE id = ANY($1)`, [
        ids(created.supplierId),
      ]);
      await dataSource.query(`DELETE FROM user_sessions WHERE id = ANY($1)`, [
        sessionIds,
      ]);
    } finally {
      // The keys were read before any row went, so a failed delete above leaves no orphan file.
      const storage = app.get(S3StorageService);
      for (const { storage_key } of photos) {
        await storage.deleteObject(storage_key).catch(() => undefined);
      }
      await app.close();
    }
  });

  it('builds two cabinets from an order and takes them from assignment to completion', async () => {
    // 1. Stock for the order: a supplier, an item and a purchase order received in full.
    created.supplierId = (
      (
        await post('purchasing', '/inventory/suppliers', {
          code: `NCC-PRD-${tag}`,
          name: `E2E production supplier ${tag}`,
        }).expect(201)
      ).body as { id: number }
    ).id;
    created.itemId = (
      (
        await post('purchasing', '/items', {
          code: `PRD-${tag}-X`,
          name: `E2E production item ${tag}`,
          group: 'breaker',
          unit: 'pcs',
          referencePrice: 100_000,
        }).expect(201)
      ).body as { id: number }
    ).id;

    // 2. The sales chain to an order of Sales A with two cabinets, each needing one item.
    created.customerId = (
      (
        await post('sales_a', '/customers', {
          code: `KH_9999PRD${tag}`,
          name: `E2E production customer ${tag}`,
          taxCode: '0101234567',
          address: '1 Demo Street, Ho Chi Minh City',
        }).expect(201)
      ).body as { id: number }
    ).id;
    created.projectId = (
      (
        await post('sales_a', '/projects', {
          code: `DA_9999PRD${tag}`,
          customerId: created.customerId,
          name: `E2E production project ${tag}`,
          siteAddress: '2 Site Road',
        }).expect(201)
      ).body as { id: number }
    ).id;
    created.requestId = (
      (
        await post('sales_a', '/sales/requests', {
          customerId: created.customerId,
          projectId: created.projectId,
          title: `E2E production request ${tag}`,
        }).expect(201)
      ).body as { id: number }
    ).id;
    await post('sales_a', `/sales/requests/${created.requestId}/assign`, {
      engineerId: userId('engineer_a'),
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
          { tag: 'MSB', description: 'Main switchboard', quantity: 2 },
        ).expect(201)
      ).body as { panels: Array<{ id: number }> }
    ).panels[0].id;
    const withLine = await post(
      'engineer_a',
      `/sales/estimates/${created.estimateId}/panels/${panelId}/bom-lines`,
      { itemId: created.itemId, quantity: 1 },
    ).expect(201);
    const bomLineId = (
      withLine.body as { panels: Array<{ bomLines: Array<{ id: number }> }> }
    ).panels[0].bomLines[0].id;
    await post(
      'engineer_a',
      `/sales/estimates/${created.estimateId}/submit`,
    ).expect(200);
    // The engineer sends quantities only: sales fills the unit cost and marks the estimate priced.
    await patch(
      'sales_a',
      `/sales/estimates/${created.estimateId}/bom-lines/${bomLineId}/unit-cost`,
      { unitCost: 100_000 },
    ).expect(200);
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
        deliveryDate: daysFromToday(120),
      }).expect(201)
    ).body as { id: number; code: string };
    created.orderId = order.id;
    const orderStatus = async () =>
      (
        (await get('sales_a', `/sales/orders/${order.id}`).expect(200))
          .body as { status: string }
      ).status;
    expect(await orderStatus()).toBe('open');

    // The two units of material are bought and received; the order is covered before it
    // reaches the workshop.
    const draft = (
      await post('purchasing', '/inventory/purchase-orders', {
        supplierId: created.supplierId,
        vatRate: 10,
        lines: [{ itemId: created.itemId, quantity: 2, unitPrice: 100_000 }],
      }).expect(201)
    ).body as PurchaseOrderBody;
    created.purchaseOrderId = draft.id;
    await post(
      'purchasing',
      `/inventory/purchase-orders/${draft.id}/submit`,
    ).expect(200);
    await post(
      'director',
      `/inventory/purchase-orders/${draft.id}/approve`,
    ).expect(200);
    await post('storekeeper', '/inventory/receipts', {
      purchaseOrderId: draft.id,
      lines: [{ poLineId: draft.lines[0].id, quantity: 2 }],
    }).expect(201);

    // 3. The manager finds the order among the open ones and creates the production order.
    const options = (await readClean(
      'production_manager',
      `/production/open-orders?search=${encodeURIComponent(order.code)}`,
    )) as Array<{ id: number; code: string }>;
    expect(options.map((option) => option.id)).toContain(order.id);

    const draftOrder = (
      await post('production_manager', '/production/orders', {
        orderId: order.id,
      }).expect(201)
    ).body as ProductionOrderBody;
    expectNoMoneyKeys(draftOrder);
    expect(draftOrder.status).toBe('draft');
    expect(draftOrder.units.map((unit) => unit.code)).toEqual([
      'MSB-1',
      'MSB-2',
    ]);
    const productionOrderId = draftOrder.id;
    const [msb1, msb2] = draftOrder.units;
    await post('production_manager', '/production/orders', {
      orderId: order.id,
    }).expect(409);

    // 4. Technician options, assignment and planned dates. A release needs both on every unit.
    const technicians = (await readClean(
      'production_manager',
      '/production/technician-options',
    )) as Array<{ id: number }>;
    expect(technicians.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([userId('technician_a'), userId('technician_b')]),
    );
    await post(
      'production_manager',
      `/production/orders/${productionOrderId}/release`,
    ).expect(400);
    // One cabinet is already late by its plan, the other is not.
    const late = daysFromToday(-30);
    await patch(
      'production_manager',
      `/production/orders/${productionOrderId}/units/${msb1.id}`,
      { assigneeId: userId('technician_a'), plannedEndDate: late },
    ).expect(200);
    await patch(
      'production_manager',
      `/production/orders/${productionOrderId}/units/${msb2.id}`,
      { assigneeId: userId('technician_b'), plannedEndDate: daysFromToday(90) },
    ).expect(200);
    // An order with a production order is cancelled only after it.
    await post('sales_mgr', `/sales/orders/${order.id}/cancel`, {
      reason: 'khách đổi ý',
    }).expect(409);
    expect(await orderStatus()).toBe('open');

    // 5. Release: the order moves to the workshop and keeps its material.
    const released = (
      await post(
        'production_manager',
        `/production/orders/${productionOrderId}/release`,
      ).expect(200)
    ).body as ProductionOrderBody;
    expect(released.status).toBe('released');
    expect(await orderStatus()).toBe('in_production');
    expect(
      await noticesOfOrder(
        'technician_a',
        'production.order.released',
        productionOrderId,
      ),
    ).toHaveLength(1);
    expect(
      await noticesOfOrder(
        'technician_b',
        'production.order.released',
        productionOrderId,
      ),
    ).toHaveLength(1);
    expect(
      await noticesOfOrder(
        'sales_a',
        'production.order.released.owner',
        productionOrderId,
      ),
    ).toHaveLength(1);
    expect(
      await noticesOf(
        'sales_b',
        [
          'production.order.released',
          'production.order.released.owner',
          'production.order.completed.owner',
        ],
        (payload) => payload.productionOrderId === productionOrderId,
      ),
    ).toEqual([]);

    // 6. The storekeeper issues the stock to the order while it is in production.
    await post('storekeeper', '/inventory/issues', {
      orderId: order.id,
      lines: [{ itemId: created.itemId, quantity: 2 }],
    }).expect(201);

    // 7. The overdue pass: the cabinet planned in the past gives the manager and its assignee
    // one notice each, a second pass adds none, and nobody else is told about it.
    const overdue = app.get(OverdueService);
    const today = vnToday();
    expect(late < today).toBe(true);
    expect((await overdue.run(today)).candidates).toBeGreaterThanOrEqual(1);
    await overdue.run(today);
    const managerNotices = await noticesOfUnit('production_manager', msb1.id);
    expect(managerNotices.map((notice) => notice.eventType)).toEqual([
      'production.unit.overdue',
    ]);
    const assigneeNotices = await noticesOfUnit('technician_a', msb1.id);
    expect(assigneeNotices.map((notice) => notice.eventType)).toEqual([
      'production.unit.overdue.assignee',
    ]);
    expect(await noticesOfUnit('technician_b', msb1.id)).toEqual([]);
    expect(await noticesOfUnit('production_manager', msb2.id)).toEqual([]);
    expect(await noticesOfUnit('technician_b', msb2.id)).toEqual([]);

    // 8. Technician A's first cabinet: the six stages in order, a photo and a reported problem.
    const stageStart = (user: string, unitId: number, stage: string) =>
      post(user, `/production/units/${unitId}/stages/${stage}/start`);
    const stageFinish = (user: string, unitId: number, stage: string) =>
      post(user, `/production/units/${unitId}/stages/${stage}/finish`);
    // A stage cannot jump the one before it.
    await stageStart('technician_a', msb1.id, 'enclosure').expect(409);

    let issueId = 0;
    let photoId = 0;
    for (const stage of STAGES) {
      await stageStart('technician_a', msb1.id, stage).expect(200);
      if (stage === 'enclosure') {
        const issue = (
          await post('technician_a', `/production/units/${msb1.id}/issues`, {
            stage,
            description: 'Vỏ tủ lệch lỗ khoan',
            severity: 'medium',
          }).expect(201)
        ).body as { id: number; status: string };
        issueId = issue.id;
        expect(issue.status).toBe('open');
        expectNoMoneyKeys(issue);

        const upload = await request(server())
          .post(`/api/v1/production/units/${msb1.id}/photos`)
          .set(auth('technician_a'))
          .field('stage', stage)
          .field('issueId', String(issueId))
          .attach('file', PNG, {
            filename: 'cabinet.png',
            contentType: 'image/png',
          })
          .expect(201);
        const photo = upload.body as {
          id: number;
          stage: string;
          issueId: number;
          contentType: string;
        };
        photoId = photo.id;
        expect(photo).toMatchObject({
          stage,
          issueId,
          contentType: 'image/png',
        });
        // The key of the stored object never leaves the server.
        expect(JSON.stringify(upload.body)).not.toMatch(
          /storage_?key|production\//i,
        );
        expectNoMoneyKeys(photo);
        // Text sent as a picture is refused whatever the file is called.
        await request(server())
          .post(`/api/v1/production/units/${msb1.id}/photos`)
          .set(auth('technician_a'))
          .field('stage', stage)
          .attach('file', Buffer.from('not an image'), {
            filename: 'cabinet.png',
            contentType: 'image/png',
          })
          .expect(400);
      }
      const done = (
        await stageFinish('technician_a', msb1.id, stage).expect(200)
      ).body as ProgressUnitBody;
      expectNoMoneyKeys(done);
      if (stage === 'finishing') {
        expect(done.doneCount).toBe(6);
        expect(done.currentStage).toBeNull();
      }
    }
    // A cabinet is not changed by someone it is not assigned to.
    await stageStart('technician_b', msb1.id, 'material_prep').expect(404);
    // The manager is told about the problem; an open problem never held a stage back.
    expect(
      await eventually(
        () =>
          noticesOf(
            'production_manager',
            ['production.issue.opened'],
            (payload) => payload.issueId === issueId,
          ),
        (rows) => rows.length > 0,
      ),
    ).toHaveLength(1);
    // The finished cabinet is no longer late: both overdue notices left the bell.
    const afterFinish: Array<{ status: string }> = await dataSource.query(
      `SELECT status FROM notifications
        WHERE event_type = ANY($1) AND (payload->>'unitId')::int = $2`,
      [OVERDUE_EVENTS, msb1.id],
    );
    expect(afterFinish).toHaveLength(2);
    expect(afterFinish.map((row) => row.status)).not.toContain('open');

    // 9. Technician B on the second cabinet, and what they may not see of the first.
    const bUnits = (await readClean(
      'technician_b',
      `/production/units?productionOrderId=${productionOrderId}`,
    )) as Page<{ id: number }>;
    expect(bUnits.data.map((unit) => unit.id)).toEqual([msb2.id]);
    await get('technician_b', `/production/units/${msb1.id}`).expect(404);
    await get('technician_b', `/production/units/${msb1.id}/photos`).expect(
      404,
    );
    await get('technician_b', `/production/photos/${photoId}/content`).expect(
      404,
    );
    await post('technician_b', `/production/units/${msb1.id}/issues`, {
      stage: 'wiring',
      description: 'Không phải tủ của tôi',
      severity: 'low',
    }).expect(404);
    const bOrder = (await readClean(
      'technician_b',
      `/production/orders/${productionOrderId}`,
    )) as ProductionOrderBody;
    expect(bOrder.units.map((unit) => unit.code)).toEqual(['MSB-2']);
    expect(bOrder.unitCount).toBe(1);
    const bOrders = (await readClean(
      'technician_b',
      `/production/orders?orderId=${order.id}`,
    )) as Page<ProductionOrderBody>;
    expect(bOrders.data.map((row) => [row.id, row.unitCount])).toEqual([
      [productionOrderId, 1],
    ]);
    await get('technician_b', '/production/issues').expect(200);
    const bIssues = (await readClean(
      'technician_b',
      `/production/issues?productionOrderId=${productionOrderId}`,
    )) as Page<{ id: number }>;
    expect(bIssues.data.map((issue) => issue.id)).not.toContain(issueId);

    // Technician A has his own cabinet only, and the other sales owner sees neither.
    const aOrder = (await readClean(
      'technician_a',
      `/production/orders/${productionOrderId}`,
    )) as ProductionOrderBody;
    expect(aOrder.units.map((unit) => unit.code)).toEqual(['MSB-1']);
    await get('sales_b', `/production/orders/${productionOrderId}`).expect(404);
    await get('sales_b', `/production/units/${msb1.id}`).expect(404);
    const ownerView = (await readClean(
      'sales_a',
      `/production/orders/${productionOrderId}`,
    )) as ProductionOrderBody;
    expect(ownerView.units.map((unit) => unit.code)).toEqual([
      'MSB-1',
      'MSB-2',
    ]);

    // Technician B takes the second cabinet to its last stage, the manager closes the problem,
    // and only then B finishes the last stage.
    for (const stage of STAGES.slice(0, 5)) {
      await stageStart('technician_b', msb2.id, stage).expect(200);
      await stageFinish('technician_b', msb2.id, stage).expect(200);
    }
    await post('technician_a', `/production/issues/${issueId}/resolve`, {
      resolution: 'Khoan lại',
    }).expect(403);
    const resolved = (
      await post(
        'production_manager',
        `/production/issues/${issueId}/resolve`,
        {
          resolution: 'Khoan lại vỏ tủ',
        },
      ).expect(200)
    ).body as { status: string };
    expect(resolved.status).toBe('resolved');
    expect(
      await eventually(
        () =>
          noticesOf(
            'technician_a',
            ['production.issue.resolved'],
            (payload) => payload.issueId === issueId,
          ),
        (rows) => rows.length > 0,
      ),
    ).toHaveLength(1);

    await stageStart('technician_b', msb2.id, 'finishing').expect(200);
    await stageFinish('technician_b', msb2.id, 'finishing').expect(200);

    // 10. Both cabinets are finished: the production order is completed, the order stays in
    // production until delivery, and the manager and the sales owner are told.
    const completed = (await readClean(
      'production_manager',
      `/production/orders/${productionOrderId}`,
    )) as ProductionOrderBody;
    expect(completed.status).toBe('completed');
    expect(await orderStatus()).toBe('in_production');
    expect(
      await noticesOfOrder(
        'production_manager',
        'production.order.completed',
        productionOrderId,
      ),
    ).toHaveLength(1);
    expect(
      await noticesOfOrder(
        'sales_a',
        'production.order.completed.owner',
        productionOrderId,
      ),
    ).toHaveLength(1);
    // A completed production order takes no more stage changes.
    await post(
      'production_manager',
      `/production/units/${msb2.id}/stages/finishing/undo`,
      { reason: 'nhầm' },
    ).expect(409);

    // 11. The photo comes back as it went in, with a fixed content type and nosniff.
    const image = await get(
      'technician_a',
      `/production/photos/${photoId}/content`,
    )
      .buffer(true)
      .expect(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(image.body as Buffer).equals(PNG)).toBe(true);

    // 12. No production read carries a price.
    for (const path of [
      '/production/orders',
      `/production/orders/${productionOrderId}`,
      `/production/orders/${productionOrderId}/shortage`,
      '/production/open-orders',
      '/production/technician-options',
      '/production/units',
      `/production/units/${msb1.id}`,
      `/production/units/${msb2.id}`,
      `/production/units/${msb1.id}/photos`,
      '/production/issues',
      `/production/issues?productionOrderId=${productionOrderId}`,
    ]) {
      await readClean('production_manager', path);
    }
    for (const path of [
      `/production/orders/${productionOrderId}`,
      `/production/orders/${productionOrderId}/shortage`,
      `/production/units/${msb2.id}`,
      '/production/issues',
    ]) {
      await readClean('technician_b', path);
    }
    for (const path of [
      `/production/orders/${productionOrderId}`,
      `/production/units/${msb1.id}`,
    ]) {
      await readClean('sales_a', path);
    }
  });
});
