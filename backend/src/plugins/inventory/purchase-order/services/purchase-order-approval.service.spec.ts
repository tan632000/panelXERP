import {
  type CanActivate,
  ConflictException,
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Notification } from '@kernel/core/audit/notification.entity';
import { NotificationService } from '@kernel/core/audit/notification.service';
import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';
import {
  expectNoMoneyKeys,
  findMoneyKeys,
} from '@kernel/shared/testing/money-keys.helper-spec';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { SupplierReferenceCheckRegistry } from '@plugins/inventory/_shared/gateways/supplier-reference-check-registry';
import {
  describeWithDatabase,
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { PURCHASE_ORDER_REFERENCE_CHECK } from '@plugins/inventory/purchase-order/constants/purchase-order.constant';
import { PurchaseOrderController } from '@plugins/inventory/purchase-order/purchase-order.controller';
import { PurchaseOrderApprovalService } from '@plugins/inventory/purchase-order/services/purchase-order-approval.service';
import { PurchaseOrderFromRequestsService } from '@plugins/inventory/purchase-order/services/purchase-order-from-requests.service';
import { PurchaseOrderReferenceService } from '@plugins/inventory/purchase-order/services/purchase-order-reference.service';
import { PurchaseOrderService } from '@plugins/inventory/purchase-order/services/purchase-order.service';
import { Supplier } from '@plugins/inventory/supplier/entities/supplier.entity';
import { SupplierService } from '@plugins/inventory/supplier/services/supplier.service';

import type { App } from 'supertest/types';

/** Stands in for the JWT guard: the actor travels in a header instead of a token. */
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    req.user = JSON.parse(req.headers['x-test-actor']) as unknown;
    return true;
  }
}

type Row = Record<string, unknown>;
interface Detail extends Row {
  id: number;
  code: string;
  status: string;
  createdBy: number;
  editorIds: number[];
  lines: Row[];
  events: Array<{ event: string; actorId: number; reason: string | null }>;
}

describeWithDatabase('PurchaseOrderApprovalService (real Postgres)', () => {
  let db: InventoryDb;
  let app: INestApplication<App>;
  let referenceChecks: ReferenceCheckRegistry;
  let suppliers: SupplierService;
  const supplierIds: number[] = [];
  let supplierId: number;
  let itemA: number;
  let itemB: number;
  let itemC: number;

  /** Actors with the seeded grants of a role, each on a real user row (foreign keys). */
  let PURCHASING: string;
  let PURCHASING_ID: number;
  let DIRECTOR: string;
  let DIRECTOR_ID: number;
  /** Two more directors: real user rows acting with the director's grants. */
  let DIRECTOR_2: string;
  let DIRECTOR_3: string;
  let STOREKEEPER: string;

  const actor = (userId: number, role: string) => {
    const permissions = seededRolePermissions(role);
    if (!permissions) throw new Error(`Role ${role} is not seeded`);
    return JSON.stringify({ userId, role, permissions });
  };

  const createSupplier = async (active = true): Promise<number> => {
    const [row]: Array<{ id: number }> = await db.dataSource.query(
      `INSERT INTO suppliers (code, name, is_active) VALUES ($1, 'PO spec supplier', $2)
       RETURNING id`,
      [`${db.tag}-S${supplierIds.length + 1}`, active],
    );
    supplierIds.push(row.id);
    return row.id;
  };

  beforeAll(async () => {
    db = await openInventoryDb();
    PURCHASING_ID = await db.userId('purchasing');
    DIRECTOR_ID = await db.userId('director');
    PURCHASING = actor(PURCHASING_ID, 'purchasing');
    DIRECTOR = actor(DIRECTOR_ID, 'director');
    DIRECTOR_2 = actor(await db.userId('admin'), 'director');
    DIRECTOR_3 = actor(await db.userId('sales_mgr'), 'director');
    STOREKEEPER = actor(await db.userId('storekeeper'), 'storekeeper');

    supplierId = await createSupplier();
    itemA = await db.createItem();
    itemB = await db.createItem();
    itemC = await db.createItem();

    // Emit uses only the notification table.
    const notifications = new NotificationService(
      db.dataSource.getRepository(Notification),
      null as never,
      null as never,
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [PurchaseOrderController],
      providers: [
        PurchaseOrderService,
        PurchaseOrderApprovalService,
        PurchaseOrderFromRequestsService,
        PurchaseOrderReferenceService,
        ReferenceCheckRegistry,
        SupplierReferenceCheckRegistry,
        SupplierService,
        {
          provide: getRepositoryToken(Supplier),
          useValue: db.dataSource.getRepository(Supplier),
        },
        { provide: NotificationService, useValue: notifications },
        { provide: DataSource, useValue: db.dataSource },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    referenceChecks = moduleRef.get(ReferenceCheckRegistry);
    suppliers = moduleRef.get(SupplierService);
  });

  afterAll(async () => {
    await app?.close();
    if (!db) return;
    if (supplierIds.length > 0) {
      await db.dataSource.query(
        `DELETE FROM notifications WHERE event_type LIKE 'inventory.purchase_order.%'
           AND (payload->>'purchaseOrderId')::int IN
               (SELECT id FROM purchase_orders WHERE supplier_id = ANY($1))`,
        [supplierIds],
      );
      // Lines and history go with their order (ON DELETE CASCADE).
      await db.dataSource.query(
        `DELETE FROM purchase_orders WHERE supplier_id = ANY($1)`,
        [supplierIds],
      );
      await db.dataSource.query(`DELETE FROM suppliers WHERE id = ANY($1)`, [
        supplierIds,
      ]);
    }
    await db.close();
  });

  const as = (token: string) => ({ 'x-test-actor': token });
  const http = () => request(app.getHttpServer());

  const WORKED_EXAMPLE_LINES = () => [
    { itemId: itemA, quantity: 10, unitPrice: 100000 },
    { itemId: itemB, quantity: 3, unitPrice: 123457 },
    { itemId: itemC, quantity: 2.5, unitPrice: 33333 },
  ];

  const createDraft = async (
    token = PURCHASING,
    lines: Row[] = [{ itemId: itemA, quantity: 2, unitPrice: 5000 }],
    supplier = supplierId,
  ): Promise<Detail> => {
    const res = await http()
      .post('/inventory/purchase-orders')
      .set(as(token))
      .send({ supplierId: supplier, vatRate: 10, lines })
      .expect(201);
    return res.body as Detail;
  };
  const act = (token: string, id: number, action: string, reason?: string) =>
    http()
      .post(`/inventory/purchase-orders/${id}/${action}`)
      .set(as(token))
      .send(reason === undefined ? {} : { reason });
  const edit = (token: string, id: number, body: Row) =>
    http().patch(`/inventory/purchase-orders/${id}`).set(as(token)).send(body);
  const detail = async (id: number, token = PURCHASING): Promise<Detail> =>
    (
      await http()
        .get(`/inventory/purchase-orders/${id}`)
        .set(as(token))
        .expect(200)
    ).body as Detail;
  const pending = async (): Promise<Detail> => {
    const order = await createDraft();
    await act(PURCHASING, order.id, 'submit').expect(200);
    return order;
  };

  describe('money', () => {
    it('prices the worked example to the dong and numbers it PO_YYYY_NNNN', async () => {
      const res = await http()
        .post('/inventory/purchase-orders')
        .set(as(PURCHASING))
        .send({ supplierId, vatRate: 8, lines: WORKED_EXAMPLE_LINES() })
        .expect(201);
      const order = res.body as Detail;

      expect(order.code).toMatch(/^PO_\d{4}_\d{4}$/);
      expect(order).toMatchObject({
        status: 'draft',
        vatRate: 8,
        subtotal: 1453704,
        vatAmount: 116296,
        total: 1570000,
      });
      expect(order.lines.map((line) => line.amount)).toEqual([
        1000000, 370371, 83333,
      ]);
      expect(order.lines[2]).toMatchObject({ quantity: 2.5, itemUnit: 'Cái' });
    });

    it('recomputes the totals when a draft changes its VAT rate', async () => {
      const order = await createDraft(PURCHASING, WORKED_EXAMPLE_LINES());
      const res = await edit(PURCHASING, order.id, { vatRate: 0 }).expect(200);
      expect(res.body).toMatchObject({
        subtotal: 1453704,
        vatAmount: 0,
        total: 1453704,
      });
    });

    it('serves a storekeeper quantities without any price, and refuses it a create', async () => {
      const order = await createDraft(PURCHASING, WORKED_EXAMPLE_LINES());
      await http()
        .post('/inventory/purchase-orders')
        .set(as(STOREKEEPER))
        .send({ supplierId, vatRate: 0, lines: [] })
        .expect(403);

      const list = await http()
        .get('/inventory/purchase-orders')
        .query({ supplierId })
        .set(as(STOREKEEPER))
        .expect(200);
      expectNoMoneyKeys(list.body);
      expect((list.body as { data: Row[] }).data[0]).not.toHaveProperty(
        'vatRate',
      );

      const read = await detail(order.id, STOREKEEPER);
      expectNoMoneyKeys(read);
      expect(read).not.toHaveProperty('vatRate');
      expect(read.lines[0]).toMatchObject({ itemId: itemA, quantity: 10 });

      expect(findMoneyKeys(await detail(order.id))).toEqual(
        expect.arrayContaining(['$.total', '$.lines[0].unitPrice']),
      );
    });
  });

  describe('separation of duties', () => {
    it('lets an uninvolved director approve, records the history and tells the creator', async () => {
      const order = await pending();
      const res = await act(DIRECTOR, order.id, 'approve').expect(200);
      const approved = res.body as Detail;

      expect(approved.status).toBe('approved');
      expect(approved.events.map((event) => event.event)).toEqual([
        'submitted',
        'approved',
      ]);
      const notices: Array<{ event_type: string; user_ids: number[] | null }> =
        await db.dataSource.query(
          `SELECT event_type, user_ids FROM notifications
            WHERE (payload->>'purchaseOrderId')::int = $1 ORDER BY id`,
          [order.id],
        );
      expect(notices.map((notice) => notice.event_type)).toEqual([
        'inventory.purchase_order.submitted',
        'inventory.purchase_order.approved',
      ]);
      expect(notices[1].user_ids).toEqual([PURCHASING_ID]);
    });

    it('tells the directors, never the submitter, that an order waits', async () => {
      const order = await pending();
      const [notice]: Array<{
        role_codes: string[];
        required_scope: string;
      }> = await db.dataSource.query(
        `SELECT role_codes, required_scope FROM notifications
          WHERE event_type = 'inventory.purchase_order.submitted'
            AND (payload->>'purchaseOrderId')::int = $1`,
        [order.id],
      );
      expect(notice).toMatchObject({
        role_codes: ['director'],
        required_scope: 'purchase_order:approve',
      });
    });

    it('refuses the creator with 403', async () => {
      const order = await createDraft(DIRECTOR);
      await act(DIRECTOR, order.id, 'submit').expect(200);
      await act(DIRECTOR, order.id, 'approve').expect(403);
      await act(DIRECTOR, order.id, 'reject', 'No').expect(403);
      expect((await detail(order.id)).status).toBe('pending_approval');
    });

    it('refuses the submitter with 403', async () => {
      const order = await createDraft();
      await act(DIRECTOR, order.id, 'submit').expect(200);
      await act(DIRECTOR, order.id, 'approve').expect(403);
    });

    it('refuses a director who edited the draft even after someone else submitted it', async () => {
      const order = await createDraft();
      await edit(DIRECTOR, order.id, {
        note: 'Ask for delivery by truck',
      }).expect(200);
      await act(PURCHASING, order.id, 'submit').expect(200);

      expect((await detail(order.id)).editorIds).toEqual([DIRECTOR_ID]);
      await act(DIRECTOR, order.id, 'approve').expect(403);
      await act(DIRECTOR_2, order.id, 'approve').expect(200);
    });

    it('refuses an earlier submitter after a rejection and an unchanged resubmit', async () => {
      const order = await createDraft();
      await act(DIRECTOR, order.id, 'submit').expect(200);
      await act(DIRECTOR_2, order.id, 'reject', 'Check the quantities').expect(
        200,
      );
      await act(PURCHASING, order.id, 'submit').expect(200);

      // The rejection cleared `submitted_by`; the history still names the first submitter.
      await act(DIRECTOR, order.id, 'approve').expect(403);
      await act(DIRECTOR, order.id, 'reject', 'No').expect(403);
      await act(DIRECTOR_3, order.id, 'approve').expect(200);
    });

    it('refuses purchasing, which holds no approve grant', async () => {
      const order = await pending();
      await act(PURCHASING, order.id, 'approve').expect(403);
      await act(PURCHASING, order.id, 'reject', 'No').expect(403);
    });

    it('rejects back to draft with the reason in the history, then approves the resubmitted order', async () => {
      const order = await pending();
      await act(DIRECTOR, order.id, 'reject').expect(400);
      const rejected = (
        await act(DIRECTOR, order.id, 'reject', '  Price too high  ').expect(
          200,
        )
      ).body as Detail;

      expect(rejected.status).toBe('draft');
      expect(rejected.events.at(-1)).toMatchObject({
        event: 'rejected',
        reason: 'Price too high',
      });

      await edit(PURCHASING, order.id, {
        lines: [{ itemId: itemA, quantity: 2, unitPrice: 4500 }],
      }).expect(200);
      await act(PURCHASING, order.id, 'submit').expect(200);
      const approved = (await act(DIRECTOR_3, order.id, 'approve').expect(200))
        .body as Detail;

      expect(approved.status).toBe('approved');
      expect(approved.events.map((event) => event.event)).toEqual([
        'submitted',
        'rejected',
        'submitted',
        'approved',
      ]);
      expect(approved.total).toBe(9900);
    });
  });

  describe('transitions', () => {
    const STATUSES = [
      'draft',
      'pending_approval',
      'approved',
      'partially_received',
      'received',
      'closed',
      'cancelled',
    ] as const;
    /** The statuses each action may leave; every other one answers 409. */
    const ALLOWED: Record<string, readonly string[]> = {
      edit: ['draft'],
      submit: ['draft'],
      approve: ['pending_approval'],
      reject: ['pending_approval'],
      cancel: ['draft', 'pending_approval', 'approved'],
      close: ['approved', 'partially_received'],
    };

    it.each(STATUSES)(
      'answers 409 to every action %s does not allow',
      async (status) => {
        const order = await createDraft();
        await db.dataSource.query(
          `UPDATE purchase_orders SET status = $2 WHERE id = $1`,
          [order.id, status],
        );

        for (const [action, allowed] of Object.entries(ALLOWED)) {
          if (allowed.includes(status)) continue;
          const res =
            action === 'edit'
              ? await edit(PURCHASING, order.id, { note: 'x' })
              : await act(
                  action === 'approve' || action === 'reject'
                    ? DIRECTOR_2
                    : PURCHASING,
                  order.id,
                  action,
                  'Because',
                );
          expect({ action, status: res.status }).toEqual({
            action,
            status: 409,
          });
        }
        expect((await detail(order.id)).status).toBe(status);
      },
    );

    it('refuses to submit a draft without lines', async () => {
      const order = await createDraft(PURCHASING, []);
      await act(PURCHASING, order.id, 'submit').expect(409);
    });

    it('refuses to cancel once goods are received, and short-closes instead', async () => {
      const order = await pending();
      await act(DIRECTOR, order.id, 'approve').expect(200);
      await db.dataSource.query(
        `UPDATE purchase_order_lines SET received_qty = 1 WHERE purchase_order_id = $1`,
        [order.id],
      );

      await act(PURCHASING, order.id, 'cancel', 'Not needed').expect(409);
      const closed = (
        await act(
          PURCHASING,
          order.id,
          'close',
          'Supplier out of stock',
        ).expect(200)
      ).body as Detail;
      expect(closed).toMatchObject({
        status: 'closed',
        closeReason: 'Supplier out of stock',
      });
    });

    it('cancels an approved order nothing was received on, with its reason', async () => {
      const order = await pending();
      await act(DIRECTOR, order.id, 'approve').expect(200);
      await act(PURCHASING, order.id, 'cancel').expect(400);
      const cancelled = (
        await act(PURCHASING, order.id, 'cancel', 'Project dropped').expect(200)
      ).body as Detail;
      expect(cancelled).toMatchObject({
        status: 'cancelled',
        cancelReason: 'Project dropped',
      });
    });
  });

  describe('references', () => {
    it('refuses an unknown or inactive supplier, a deleted item and a bad VAT rate', async () => {
      const lines = [{ itemId: itemA, quantity: 1, unitPrice: 1 }];
      const send = (body: Row) =>
        http()
          .post('/inventory/purchase-orders')
          .set(as(PURCHASING))
          .send(body);

      await send({ supplierId: 2147483000, vatRate: 0, lines }).expect(404);
      await send({
        supplierId: await createSupplier(false),
        vatRate: 0,
        lines,
      }).expect(409);
      await send({ supplierId, vatRate: 7, lines }).expect(400);
      await send({
        supplierId,
        vatRate: 0,
        lines: [{ itemId: itemA, quantity: 1.0005, unitPrice: 1 }],
      }).expect(400);

      const gone = await db.createItem();
      await db.dataSource.query(
        `UPDATE items SET is_deleted = true WHERE id = $1`,
        [gone],
      );
      await send({
        supplierId,
        vatRate: 0,
        lines: [{ itemId: gone, quantity: 1, unitPrice: 1 }],
      }).expect(409);
      await db.dataSource.query(
        `UPDATE items SET is_deleted = false WHERE id = $1`,
        [gone],
      );
    });

    it('never deletes a supplier under a first order created at the same time', async () => {
      for (let round = 0; round < 5; round += 1) {
        const fresh = await createSupplier();
        const [created, removed] = await Promise.allSettled([
          http()
            .post('/inventory/purchase-orders')
            .set(as(PURCHASING))
            .send({ supplierId: fresh, vatRate: 0, lines: [] }),
          suppliers.remove(fresh, { userId: PURCHASING_ID }),
        ]);
        const orderMade =
          created.status === 'fulfilled' && created.value.status === 201;
        const supplierGone = removed.status === 'fulfilled';
        // Exactly one wins: the order refuses a deleted supplier (409), or the delete refuses
        // a supplier the committed order names (409).
        expect({ orderMade, supplierGone }).not.toEqual({
          orderMade: true,
          supplierGone: true,
        });
        expect(orderMade || supplierGone).toBe(true);
        // The loser is refused as a conflict, never by a deadlock or another failure.
        if (!orderMade) {
          expect(created).toMatchObject({
            status: 'fulfilled',
            value: { status: 409 },
          });
        }
        if (!supplierGone) {
          expect(removed.status).toBe('rejected');
          expect(removed.reason).toBeInstanceOf(ConflictException);
        }
      }
    });

    it('vetoes deleting a supplier any order names, and lets an unused one go', async () => {
      const used = await createSupplier();
      const order = await createDraft(PURCHASING, undefined, used);
      await act(PURCHASING, order.id, 'cancel', 'Wrong supplier').expect(200);

      await expect(
        suppliers.remove(used, { userId: PURCHASING_ID }),
      ).rejects.toBeInstanceOf(ConflictException);
      const unused = await createSupplier();
      await expect(
        suppliers.remove(unused, { userId: PURCHASING_ID }),
      ).resolves.toBeDefined();
    });

    it('vetoes deleting an item on a draft or an approved order, not one only on a cancelled order', async () => {
      const onDraft = await db.createItem();
      const onApproved = await db.createItem();
      const onCancelled = await db.createItem();
      await createDraft(PURCHASING, [
        { itemId: onDraft, quantity: 1, unitPrice: 1 },
      ]);
      const approved = await createDraft(PURCHASING, [
        { itemId: onApproved, quantity: 1, unitPrice: 1 },
      ]);
      await act(PURCHASING, approved.id, 'submit').expect(200);
      await act(DIRECTOR, approved.id, 'approve').expect(200);
      const cancelled = await createDraft(PURCHASING, [
        { itemId: onCancelled, quantity: 1, unitPrice: 1 },
      ]);
      await act(PURCHASING, cancelled.id, 'cancel', 'Duplicate').expect(200);

      expect(await referenceChecks.referencingItem(onDraft)).toContain(
        PURCHASE_ORDER_REFERENCE_CHECK,
      );
      expect(await referenceChecks.referencingItem(onApproved)).toContain(
        PURCHASE_ORDER_REFERENCE_CHECK,
      );
      expect(await referenceChecks.referencingItem(onCancelled)).not.toContain(
        PURCHASE_ORDER_REFERENCE_CHECK,
      );
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of an approve and a reject racing on one order win', async () => {
      for (let round = 0; round < 5; round += 1) {
        const order = await pending();
        const [approve, reject] = await Promise.all([
          act(DIRECTOR, order.id, 'approve'),
          act(DIRECTOR_2, order.id, 'reject', 'Race'),
        ]);
        expect([approve.status, reject.status].sort()).toEqual([200, 409]);
        expect((await detail(order.id)).status).toBe(
          approve.status === 200 ? 'approved' : 'draft',
        );
      }
    });

    it('never approves an order a racing cancel already ended', async () => {
      // A cancel may follow an approval (nothing received yet), so both can succeed — but
      // only in that order, and the history then shows both decisions.
      for (let round = 0; round < 5; round += 1) {
        const order = await pending();
        const [approve, cancel] = await Promise.all([
          act(DIRECTOR, order.id, 'approve'),
          act(PURCHASING, order.id, 'cancel', 'Race'),
        ]);
        expect(cancel.status).toBe(200);
        const final = await detail(order.id);
        expect(final.status).toBe('cancelled');
        expect(final.events.map((event) => event.event)).toEqual(
          approve.status === 200
            ? ['submitted', 'approved', 'cancelled']
            : ['submitted', 'cancelled'],
        );
        if (approve.status !== 200) expect(approve.status).toBe(409);
      }
    });

    it('numbers five concurrent creates with five distinct codes', async () => {
      const created = await Promise.all(
        Array.from({ length: 5 }, () =>
          http()
            .post('/inventory/purchase-orders')
            .set(as(PURCHASING))
            .send({ supplierId, vatRate: 0, lines: [] }),
        ),
      );
      expect(created.map((res) => res.status)).toEqual([
        201, 201, 201, 201, 201,
      ]);
      const codes = created.map((res) => (res.body as Detail).code);
      expect(new Set(codes).size).toBe(5);
    });
  });
});
