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

import type { App } from 'supertest/types';

/** A Vietnamese calendar date `days` away from today, so the plan never ages into the past. */
function daysFromToday(days: number): string {
  const date = new Date(`${vnToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

jest.setTimeout(300_000);

interface Session {
  token: string;
  userId: number;
}

interface UnitView {
  id: number;
  code: string;
}

interface ProductionOrderBody {
  id: number;
  status: string;
  units: UnitView[];
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

interface ChecklistItem {
  id: number;
}

interface QcUnitBody {
  unitId: number;
  qcStatus: string;
  rounds: Array<{
    roundNo: number;
    result: string;
    items: Array<{ id: number; result: string; photos: Array<{ id: number }> }>;
  }>;
  defects: Array<{ id: number; status: string }>;
}

interface NoteBody {
  id: number;
  code: string;
  status: string;
  files: Array<{ id: number }>;
}

interface DeliveryOrderBody {
  status: string;
  siteAddress: string | null;
  units: Array<{ unitId: number; qcStatus: string; deliveryStatus: string }>;
}

interface InstallationBody {
  id: number;
  status: string;
  siteAddress: string | null;
  photos: Array<{ id: number }>;
}

interface AcceptanceBody {
  id: number;
  files: Array<{ id: number }>;
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
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n', 'latin1');

const ORDER_UPDATED = 'sales.order.updated';
const SITE_ADDRESS = '2 Site Road';

/**
 * The delivery chain over HTTP against the compose Postgres and object storage, every actor a
 * seeded demo account: an order of two cabinets built to the end of production, QC rounds with a
 * failure, a defect fixed and verified by two different people, the two cabinets delivered in
 * two notes until the order is `delivered`, the installation, and the acceptance minutes that
 * make the order `completed`. Every P4 read passes the money-key check, a technician reaches no
 * P4 endpoint, and the other sales owner sees nothing. Every row and object the run creates is
 * removed in `afterAll`.
 */
describe('Delivery chain (e2e)', () => {
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

  /** A response that must carry no price; returns its body. */
  const clean = <T>(res: { body: unknown }): T => {
    expectNoMoneyKeys(res.body);
    return res.body as T;
  };

  /** A read that must succeed and carry no price. */
  const readClean = async <T = unknown>(user: string, path: string) => {
    const res = await get(user, path);
    expect({ user, path, status: res.status }).toEqual({
      user,
      path,
      status: 200,
    });
    return clean<T>(res);
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
    eventType: string,
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
          (notice) => notice.eventType === eventType && match(notice.payload),
        ),
      );
      cursor = body.nextCursor;
    } while (cursor !== null);
    return found;
  };
  const noticesOfUnit = (user: string, eventType: string, unitId: number) =>
    eventually(
      () => noticesOf(user, eventType, (payload) => payload.unitId === unitId),
      (rows) => rows.length > 0,
    );
  const orderNotices = (user: string, change: string, noteCode?: string) =>
    noticesOf(
      user,
      ORDER_UPDATED,
      (payload) =>
        payload.orderId === created.orderId &&
        payload.change === change &&
        (noteCode === undefined || payload.deliveryNoteCode === noteCode),
    );
  const orderNoticeOf = (user: string, change: string, noteCode?: string) =>
    eventually(
      () => orderNotices(user, change, noteCode),
      (rows) => rows.length > 0,
    );

  const reservationsOfOrder = async (): Promise<number> => {
    const rows: Array<{ total: string }> = await dataSource.query(
      `SELECT COALESCE(SUM(quantity), 0)::text AS total FROM stock_reservations WHERE order_id = $1`,
      [created.orderId],
    );
    return Number(rows[0].total);
  };

  const attachDocuments = (req: request.Test, field: string, count = 1) => {
    for (let index = 0; index < count; index += 1) {
      req.attach(field, PDF, {
        filename: `minutes-${index}.pdf`,
        contentType: 'application/pdf',
      });
    }
    return req;
  };
  const receive = (noteId: number, body: Record<string, string>, files = 1) => {
    const req = request(server())
      .post(`/api/v1/delivery/notes/${noteId}/receive`)
      .set(auth('storekeeper'));
    for (const [key, value] of Object.entries(body)) req.field(key, value);
    return attachDocuments(req, 'files', files);
  };
  const accept = (user: string, body: Record<string, string>, files = 1) => {
    const req = request(server())
      .post(`/api/v1/delivery/orders/${created.orderId}/acceptance`)
      .set(auth(user));
    for (const [key, value] of Object.entries(body)) req.field(key, value);
    return attachDocuments(req, 'files', files);
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
      'director',
      'sales_a',
      'sales_b',
      'sales_mgr',
      'engineer_a',
      'purchasing',
      'storekeeper',
      'production_manager',
      'qc_a',
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
    let files: Array<{ storage_key: string }> = [];
    try {
      const orderParams = [ids(created.orderId)];
      const productionOrders = `SELECT id FROM production_orders WHERE order_id = ANY($1)`;
      const units = `SELECT id FROM production_units WHERE production_order_id IN (${productionOrders})`;
      const notes = `SELECT id FROM delivery_notes WHERE order_id = ANY($1)`;
      const installations = `SELECT id FROM installations WHERE order_id = ANY($1)`;
      const acceptances = `SELECT id FROM acceptances WHERE order_id = ANY($1)`;
      const roundItems = `SELECT it.id FROM qc_round_items it
         JOIN qc_rounds r ON r.id = it.round_id WHERE r.unit_id IN (${units})`;

      // Files live in object storage as well as in a row; read the keys before any row goes.
      files = await dataSource.query(
        `SELECT storage_key FROM delivery_note_files WHERE note_id IN (${notes})
         UNION ALL SELECT storage_key FROM installation_photos WHERE installation_id IN (${installations})
         UNION ALL SELECT storage_key FROM acceptance_files WHERE acceptance_id IN (${acceptances})
         UNION ALL SELECT storage_key FROM qc_photos WHERE round_item_id IN (${roundItems})`,
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

      // P4 rows first: they name the order, the unit and each other.
      const p4 = [
        `DELETE FROM delivery_note_files WHERE note_id IN (${notes})`,
        `DELETE FROM delivery_note_units WHERE note_id IN (${notes})`,
        `DELETE FROM delivery_notes WHERE order_id = ANY($1)`,
        `DELETE FROM installation_photos WHERE installation_id IN (${installations})`,
        `DELETE FROM installations WHERE order_id = ANY($1)`,
        `DELETE FROM acceptance_files WHERE acceptance_id IN (${acceptances})`,
        `DELETE FROM acceptances WHERE order_id = ANY($1)`,
        `DELETE FROM qc_defects WHERE unit_id IN (${units})`,
        `DELETE FROM qc_photos WHERE round_item_id IN (${roundItems})`,
        `DELETE FROM qc_round_items WHERE round_id IN
           (SELECT id FROM qc_rounds WHERE unit_id IN (${units}))`,
        `DELETE FROM qc_rounds WHERE unit_id IN (${units})`,
      ];
      for (const sql of p4) await dataSource.query(sql, orderParams);

      // Production rows: they name the order, the unit and each other.
      for (const table of [
        'production_unit_photos',
        'production_issues',
        'production_unit_stages',
      ]) {
        await dataSource.query(
          `DELETE FROM ${table} WHERE unit_id IN (${units})`,
          orderParams,
        );
      }
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
      for (const table of ['stock_issues', 'stock_workshop_returns']) {
        await dataSource.query(
          `DELETE FROM ${table} WHERE order_id = ANY($1)`,
          orderParams,
        );
      }
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
      for (const { storage_key } of files) {
        await storage.deleteObject(storage_key).catch(() => undefined);
      }
      await app.close();
    }
  });

  it('takes two finished cabinets through QC, two deliveries, installation and acceptance to a completed order', async () => {
    // 1. Stock, then the sales chain to an order of Sales A with two cabinets.
    created.supplierId = (
      (
        await post('purchasing', '/inventory/suppliers', {
          code: `NCC-DLV-${tag}`,
          name: `E2E delivery supplier ${tag}`,
        }).expect(201)
      ).body as { id: number }
    ).id;
    created.itemId = (
      (
        await post('purchasing', '/items', {
          code: `DLV-${tag}-X`,
          name: `E2E delivery item ${tag}`,
          group: 'breaker',
          unit: 'pcs',
          referencePrice: 100_000,
        }).expect(201)
      ).body as { id: number }
    ).id;
    created.customerId = (
      (
        await post('sales_a', '/customers', {
          code: `KH_9999DLV${tag}`,
          name: `E2E delivery customer ${tag}`,
          taxCode: '0101234567',
          address: '1 Demo Street, Ho Chi Minh City',
        }).expect(201)
      ).body as { id: number }
    ).id;
    created.projectId = (
      (
        await post('sales_a', '/projects', {
          code: `DA_9999DLV${tag}`,
          customerId: created.customerId,
          name: `E2E delivery project ${tag}`,
          siteAddress: SITE_ADDRESS,
        }).expect(201)
      ).body as { id: number }
    ).id;
    created.requestId = (
      (
        await post('sales_a', '/sales/requests', {
          customerId: created.customerId,
          projectId: created.projectId,
          title: `E2E delivery request ${tag}`,
          technicalRequirements: 'PIR 50mm',
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

    // Two units of material are bought and received; the workshop is issued one of them, so
    // the order still holds a reservation until it is delivered.
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

    // 2. Production: create, assign both cabinets, release.
    const draftOrder = (
      await post('production_manager', '/production/orders', {
        orderId: order.id,
      }).expect(201)
    ).body as ProductionOrderBody;
    const productionOrderId = draftOrder.id;
    const [msb1, msb2] = draftOrder.units;
    expect([msb1.code, msb2.code]).toEqual(['MSB-1', 'MSB-2']);
    for (const [unit, technician] of [
      [msb1, 'technician_a'],
      [msb2, 'technician_b'],
    ] as const) {
      await patch(
        'production_manager',
        `/production/orders/${productionOrderId}/units/${unit.id}`,
        { assigneeId: userId(technician), plannedEndDate: daysFromToday(90) },
      ).expect(200);
    }
    await post(
      'production_manager',
      `/production/orders/${productionOrderId}/release`,
    ).expect(200);
    expect(await orderStatus()).toBe('in_production');
    await post('storekeeper', '/inventory/issues', {
      orderId: order.id,
      lines: [{ itemId: created.itemId, quantity: 1 }],
    }).expect(201);
    expect(await reservationsOfOrder()).toBeGreaterThan(0);

    // 3. Technician A finishes all six stages of MSB-1; MSB-2 is not touched.
    const finishStages = async (technician: string, unitId: number) => {
      for (const stage of STAGES) {
        await post(
          technician,
          `/production/units/${unitId}/stages/${stage}/start`,
        ).expect(200);
        await post(
          technician,
          `/production/units/${unitId}/stages/${stage}/finish`,
        ).expect(200);
      }
    };
    await finishStages('technician_a', msb1.id);
    const readProductionOrder = async () =>
      (
        await readClean<ProductionOrderBody>(
          'production_manager',
          `/production/orders/${productionOrderId}`,
        )
      ).status;
    expect(await readProductionOrder()).toBe('released');

    // 4. QC round on MSB-1 with one failure. A cabinet whose finishing is pending is not ready,
    // and a failure needs a note.
    const items = await readClean<ChecklistItem[]>(
      'qc_a',
      '/delivery/qc/checklist-items',
    );
    expect(items.length).toBeGreaterThan(1);
    const results = (failIndex: number | null) =>
      items.map((item, index) =>
        index === failIndex
          ? {
              checklistItemId: item.id,
              result: 'fail',
              note: 'Sơn xước cánh cửa',
            }
          : { checklistItemId: item.id, result: 'pass' },
      );
    await post('qc_a', `/delivery/qc/units/${msb2.id}/rounds`, {
      results: results(null),
    }).expect(409);
    await post('qc_a', `/delivery/qc/units/${msb1.id}/rounds`, {
      results: items.map((item, index) => ({
        checklistItemId: item.id,
        result: index === 0 ? 'fail' : 'pass',
      })),
    }).expect(400);
    const failed = clean<QcUnitBody>(
      await post('qc_a', `/delivery/qc/units/${msb1.id}/rounds`, {
        results: results(0),
      }).expect(201),
    );
    expect(failed.qcStatus).toBe('failed');
    expect(failed.rounds.map((round) => round.result)).toEqual(['failed']);
    expect(failed.defects.map((defect) => defect.status)).toEqual(['open']);
    const failedItem = failed.rounds[0].items.find(
      (item) => item.result === 'fail',
    );
    if (!failedItem) throw new Error('the failed round has no failed item');

    // The photo of the failure: stored, listed without a key, served back as it went in.
    const upload = await request(server())
      .post(`/api/v1/delivery/qc/round-items/${failedItem.id}/photos`)
      .set(auth('qc_a'))
      .attach('file', PNG, { filename: 'door.png', contentType: 'image/png' })
      .expect(201);
    const photo = clean<{ id: number }>(upload);
    expect(JSON.stringify(upload.body)).not.toMatch(/storage_?key|delivery\//i);
    const photoRes = await get(
      'qc_a',
      `/delivery/qc/photos/${photo.id}/content`,
    )
      .buffer(true)
      .expect(200);
    expect(photoRes.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(photoRes.body as Buffer).equals(PNG)).toBe(true);

    // The production manager is told, fixes the defect, and cannot verify his own fix (Q8).
    expect(
      await noticesOfUnit('production_manager', 'qc.unit.failed', msb1.id),
    ).toHaveLength(1);
    const defectId = failed.defects[0].id;
    await post('qc_a', `/delivery/qc/defects/${defectId}/fix`, {
      note: 'Sơn lại',
    }).expect(403);
    await post('qc_a', `/delivery/qc/units/${msb1.id}/rounds`, {
      results: results(null),
    }).expect(409);
    clean(
      await post('production_manager', `/delivery/qc/defects/${defectId}/fix`, {
        note: 'Sơn lại cánh cửa',
      }).expect(200),
    );
    await post(
      'production_manager',
      `/delivery/qc/defects/${defectId}/verify`,
    ).expect(409);
    clean(
      await post('qc_a', `/delivery/qc/defects/${defectId}/verify`).expect(200),
    );

    // 5. The second round has no failure: MSB-1 passed, the storekeeper is told.
    const passed = clean<QcUnitBody>(
      await post('qc_a', `/delivery/qc/units/${msb1.id}/rounds`, {
        results: results(null),
      }).expect(201),
    );
    expect(passed.qcStatus).toBe('passed');
    expect(
      await noticesOfUnit('storekeeper', 'qc.unit.passed', msb1.id),
    ).toHaveLength(1);
    await post('qc_a', `/delivery/qc/units/${msb1.id}/rounds`, {
      results: results(null),
    }).expect(409);

    // 6. While the production order is released, QC vetoes the undo and the cancel (Q1, Q2).
    await post(
      'production_manager',
      `/production/units/${msb1.id}/stages/finishing/undo`,
      { reason: 'nhầm' },
    ).expect(409);
    await post(
      'production_manager',
      `/production/orders/${productionOrderId}/cancel`,
      { reason: 'nhầm' },
    ).expect(409);
    expect(await readProductionOrder()).toBe('released');

    // 7. MSB-2 is finished, listed as waiting, and passed.
    await finishStages('technician_b', msb2.id);
    expect(await readProductionOrder()).toBe('completed');
    expect(await orderStatus()).toBe('in_production');
    const waiting = await readClean<Page<{ unitId: number }>>(
      'qc_a',
      `/delivery/qc/units?qcStatus=waiting&orderId=${order.id}`,
    );
    expect(waiting.data.map((unit) => unit.unitId)).toEqual([msb2.id]);
    expect(
      clean<QcUnitBody>(
        await post('qc_a', `/delivery/qc/units/${msb2.id}/rounds`, {
          results: results(null),
        }).expect(201),
      ).qcStatus,
    ).toBe('passed');

    // 8. Delivery note 1 (MSB-1): the order offers it, the address is prefilled.
    const deliverable = await readClean<Array<{ orderId: number }>>(
      'storekeeper',
      '/delivery/orders/deliverable',
    );
    expect(deliverable.map((row) => row.orderId)).toContain(order.id);
    const page = await readClean<DeliveryOrderBody>(
      'storekeeper',
      `/delivery/orders/${order.id}`,
    );
    expect(page.siteAddress).toBe(SITE_ADDRESS);
    expect(page.units.map((unit) => unit.qcStatus)).toEqual([
      'passed',
      'passed',
    ]);
    const note1 = clean<NoteBody>(
      await post('storekeeper', '/delivery/notes', {
        orderId: order.id,
        unitIds: [msb1.id],
      }).expect(201),
    );
    expect(note1.code).toMatch(/^PGH_\d{4}_\d{4}$/);
    expect(note1.status).toBe('draft');
    clean(
      await post('storekeeper', `/delivery/notes/${note1.id}/ship`).expect(200),
    );
    // A receipt needs a handover file and a receiver.
    await receive(
      note1.id,
      {
        receiverName: 'Anh Minh',
        receivedDate: vnToday(),
      },
      0,
    ).expect(400);
    const received1 = clean<NoteBody>(
      await receive(note1.id, {
        receiverName: 'Anh Minh',
        receivedDate: vnToday(),
      }).expect(200),
    );
    expect(received1.status).toBe('received');
    expect(received1.files).toHaveLength(1);
    await receive(note1.id, {
      receiverName: 'Anh Minh',
      receivedDate: vnToday(),
    }).expect(409);
    const handover = await get(
      'sales_a',
      `/delivery/notes/${note1.id}/files/${received1.files[0].id}/content`,
    )
      .buffer(true)
      .expect(200);
    expect(handover.headers['content-disposition']).toMatch(/^attachment/);
    expect(handover.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(handover.body as Buffer).equals(PDF)).toBe(true);

    // One of two cabinets received: the order is still in production, followers are told.
    expect(await orderStatus()).toBe('in_production');
    for (const user of ['production_manager', 'sales_a']) {
      expect(
        await orderNoticeOf(user, 'delivery_received', note1.code),
      ).toHaveLength(1);
    }
    expect(await orderNotices('sales_a', 'delivered')).toEqual([]);

    // A cabinet is on one live note at a time.
    await post('storekeeper', '/delivery/notes', {
      orderId: order.id,
      unitIds: [msb1.id],
    }).expect(400);

    // 9. Note 2a for MSB-2 is cancelled, which frees the cabinet for note 2.
    const note2a = clean<NoteBody>(
      await post('storekeeper', '/delivery/notes', {
        orderId: order.id,
        unitIds: [msb2.id],
      }).expect(201),
    );
    expect(
      clean<NoteBody>(
        await post('storekeeper', `/delivery/notes/${note2a.id}/cancel`, {
          reason: 'đổi lịch xe',
        }).expect(200),
      ).status,
    ).toBe('cancelled');
    const note2 = clean<NoteBody>(
      await post('storekeeper', '/delivery/notes', {
        orderId: order.id,
        unitIds: [msb2.id],
      }).expect(201),
    );
    clean(
      await post('storekeeper', `/delivery/notes/${note2.id}/ship`).expect(200),
    );
    expect(await orderStatus()).toBe('in_production');
    clean(
      await receive(note2.id, {
        receiverName: 'Anh Minh',
        receivedDate: vnToday(),
      }).expect(200),
    );

    // The last cabinet received: the order is delivered and holds no reservation.
    expect(await orderStatus()).toBe('delivered');
    expect(await reservationsOfOrder()).toBe(0);
    for (const user of ['production_manager', 'sales_a']) {
      expect(await orderNoticeOf(user, 'delivered', note2.code)).toHaveLength(
        1,
      );
    }
    expect(await orderNotices('sales_b', 'delivered')).toEqual([]);

    // The workshop may still return stock to a delivered order (Q9).
    clean(
      await post('storekeeper', '/inventory/workshop-returns', {
        orderId: order.id,
        lines: [{ itemId: created.itemId, quantity: 1 }],
      }).expect(201),
    );

    // 10. Installation: the project address is prefilled; acceptance waits for it to be done.
    const installation = clean<InstallationBody>(
      await post('storekeeper', `/delivery/orders/${order.id}/installation`, {
        personInCharge: 'Tổ lắp đặt 1',
      }).expect(201),
    );
    expect(installation.status).toBe('planned');
    expect(installation.siteAddress).toBe(SITE_ADDRESS);
    await post(
      'storekeeper',
      `/delivery/orders/${order.id}/installation`,
    ).expect(409);
    clean(
      await post(
        'storekeeper',
        `/delivery/installations/${installation.id}/start`,
      ).expect(200),
    );
    const todayFields = {
      representativeName: 'Chị Lan',
      signedDate: vnToday(),
    };
    await accept('sales_a', todayFields).expect(409);
    expect(await orderStatus()).toBe('delivered');
    let installPhotoId = 0;
    // Installation photo: stored, listed without a key, served back as it went in.
    const installPhoto = await request(server())
      .post(`/api/v1/delivery/installations/${installation.id}/photos`)
      .set(auth('storekeeper'))
      .attach('file', PNG, { filename: 'site.png', contentType: 'image/png' })
      .expect(201);
    expect(JSON.stringify(installPhoto.body)).not.toMatch(
      /storage_?key|delivery\//i,
    );
    installPhotoId = clean<{ id: number }>(installPhoto).id;
    const installImage = await get(
      'sales_a',
      `/delivery/installation-photos/${installPhotoId}/content`,
    )
      .buffer(true)
      .expect(200);
    expect(Buffer.from(installImage.body as Buffer).equals(PNG)).toBe(true);
    const finished = clean<InstallationBody>(
      await post(
        'storekeeper',
        `/delivery/installations/${installation.id}/finish`,
      ).expect(200),
    );
    expect(finished.status).toBe('done');

    // 11. Acceptance: another sales owner sees nothing; the order's owner completes it.
    await accept('sales_b', todayFields).expect(404);
    await get('sales_b', `/delivery/orders/${order.id}/acceptance`).expect(404);
    expect(
      await readClean('sales_a', `/delivery/orders/${order.id}/acceptance`),
    ).toBeNull();
    const acceptance = clean<AcceptanceBody>(
      await accept('sales_a', todayFields).expect(201),
    );
    expect(await orderStatus()).toBe('completed');
    await accept('sales_a', todayFields).expect(409);
    for (const user of ['production_manager', 'sales_mgr']) {
      expect(await orderNoticeOf(user, 'completed')).toHaveLength(1);
    }
    expect(await orderNotices('sales_b', 'completed')).toEqual([]);
    const minutes = await get(
      'storekeeper',
      `/delivery/acceptance-files/${acceptance.files[0].id}/content`,
    )
      .buffer(true)
      .expect(200);
    expect(minutes.headers['content-disposition']).toMatch(/^attachment/);

    // 12. Another sales owner reaches no P4 record of the order (404 before anything else).
    for (const path of [
      `/delivery/orders/${order.id}`,
      `/delivery/notes/${note1.id}`,
      `/delivery/installations/${installation.id}`,
      `/delivery/qc/units/${msb1.id}`,
      `/delivery/notes/${note1.id}/files/${received1.files[0].id}/content`,
      `/delivery/qc/photos/${photo.id}/content`,
      `/delivery/acceptance-files/${acceptance.files[0].id}/content`,
    ]) {
      expect({ path, status: (await get('sales_b', path)).status }).toEqual({
        path,
        status: 404,
      });
    }
    const otherNotes = await readClean<Page<{ id: number }>>(
      'sales_b',
      `/delivery/notes?orderId=${order.id}`,
    );
    expect(otherNotes.data).toEqual([]);

    // 13. A technician reaches no P4 endpoint.
    for (const path of [
      '/delivery/qc/checklist-items',
      '/delivery/qc/units',
      `/delivery/qc/units/${msb1.id}`,
      '/delivery/qc/defects',
      `/delivery/qc/photos/${photo.id}/content`,
      '/delivery/orders/deliverable',
      `/delivery/orders/${order.id}`,
      '/delivery/notes',
      `/delivery/notes/${note1.id}`,
      `/delivery/notes/${note1.id}/files/${received1.files[0].id}/content`,
      '/delivery/installations',
      `/delivery/installations/${installation.id}`,
      `/delivery/installation-photos/${installPhotoId}/content`,
      `/delivery/orders/${order.id}/acceptance`,
      `/delivery/acceptance-files/${acceptance.files[0].id}/content`,
    ]) {
      for (const technician of ['technician_a', 'technician_b']) {
        expect({
          technician,
          path,
          status: (await get(technician, path)).status,
        }).toEqual({ technician, path, status: 403 });
      }
    }
    for (const [path, body] of [
      [`/delivery/qc/units/${msb1.id}/rounds`, { results: [] }],
      [`/delivery/notes`, { orderId: order.id, unitIds: [msb1.id] }],
      [`/delivery/orders/${order.id}/installation`, {}],
      [`/delivery/installations/${installation.id}/start`, {}],
      [`/delivery/notes/${note1.id}/ship`, {}],
    ] as const) {
      expect({
        path,
        status: (await post('technician_a', path, body)).status,
      }).toEqual({ path, status: 403 });
    }

    // 14. No P4 read of any actor who may make it carries a price.
    const qcPaths = [
      '/delivery/qc/checklist-items',
      `/delivery/qc/units?orderId=${order.id}`,
      `/delivery/qc/units/${msb1.id}`,
      `/delivery/qc/units/${msb2.id}`,
      `/delivery/qc/defects?unitId=${msb1.id}`,
    ];
    const deliveryPaths = [
      `/delivery/orders/${order.id}`,
      `/delivery/notes?orderId=${order.id}`,
      `/delivery/notes/${note1.id}`,
      `/delivery/notes/${note2.id}`,
      `/delivery/installations?orderId=${order.id}`,
      `/delivery/installations/${installation.id}`,
    ];
    // The production manager and the QC inspector hold no acceptance grant.
    const acceptancePath = `/delivery/orders/${order.id}/acceptance`;
    await get('production_manager', acceptancePath).expect(403);
    await get('qc_a', acceptancePath).expect(403);
    const readsOf: Record<string, string[]> = {
      qc_a: qcPaths,
      production_manager: [...qcPaths, ...deliveryPaths],
      storekeeper: [
        ...qcPaths.slice(1),
        ...deliveryPaths,
        acceptancePath,
        '/delivery/orders/deliverable',
      ],
      sales_a: [...qcPaths.slice(1), ...deliveryPaths, acceptancePath],
      sales_mgr: [...qcPaths.slice(1), ...deliveryPaths, acceptancePath],
      director: [...qcPaths, ...deliveryPaths, acceptancePath],
    };
    for (const [user, paths] of Object.entries(readsOf)) {
      for (const path of paths) {
        await readClean(user, path);
      }
    }
  });
});
