import { Notification } from '@kernel/core/audit/notification.entity';
import { NotificationService } from '@kernel/core/audit/notification.service';
import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import {
  addDays,
  openDeliveryHarness,
  type DeliveryHarness,
} from '@plugins/delivery/delivery-note/delivery-note-db.helper-spec';
import {
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { ReservationService } from '@plugins/inventory/material/services/reservation.service';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import { StockAlertService } from '@plugins/inventory/stock/services/stock-alert.service';
import { vnToday } from '@plugins/production/_shared/utils/vn-today.util';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

interface NoteBody {
  id: number;
  code: string;
  orderId: number;
  status: string;
  unitCount: number;
  units: Array<{ unitId: number; code: string }>;
  files: Array<Record<string, unknown>>;
  deliveryAddress: string | null;
  note: string | null;
  shippedAt: string | null;
  receivedDate: string | null;
  receiverName: string | null;
}

interface OrderPage {
  siteAddress: string | null;
  units: Array<{
    unitId: number;
    code: string;
    qcStatus: string;
    deliveryStatus: string;
    deliveryNoteCode: string | null;
  }>;
  notes: NoteBody[];
}

const message = (body: unknown) => JSON.stringify(body);

/**
 * Delivery notes over HTTP against the real Postgres of the compose stack: eligibility, the
 * transitions, the Vietnam-date bounds of a receipt, the order becoming delivered, the notices,
 * the production guards and the scope. The production harness supplies the order, the cabinets
 * and the QC rounds; the delivery note guards are the only guards registered.
 */
describeWithDatabase('DeliveryNoteService (real Postgres)', () => {
  jest.setTimeout(180_000);

  let d: DeliveryHarness;

  beforeAll(async () => {
    d = await openDeliveryHarness();
  });

  afterAll(async () => {
    await d?.close();
  });

  beforeEach(() => {
    d.storage.objects.clear();
    d.storage.upload.mockClear();
    d.storage.deleteObject.mockClear();
  });

  const noteOf = async (res: PromiseLike<{ body: unknown }>) =>
    (await res).body as NoteBody;
  const orderPage = async (orderId: number) =>
    (await d.get(`/delivery/orders/${orderId}`).expect(200)).body as OrderPage;
  /** An actor holding more permissions than the seed gives its role, for one test. */
  const withGrant = async (
    actor: 'salesB',
    scopes: string[],
    run: () => Promise<void>,
  ) => {
    const before = d.h.actors[actor].permissions;
    d.h.actors[actor].permissions = [...before, ...scopes];
    try {
      await run();
    } finally {
      d.h.actors[actor].permissions = before;
    }
  };

  describe('create', () => {
    it('numbers the note PGH_YYYY_NNNN, prefills the address and carries no money key', async () => {
      const f = await d.readyOrder({ finished: 2 });

      const res = await d
        .create({
          orderId: f.orderId,
          unitIds: [f.passedUnitIds[0]],
          note: 'First batch',
        })
        .expect(201);

      const note = res.body as NoteBody;
      expect(note.code).toMatch(/^PGH_\d{4}_\d{4}$/);
      expect(note).toMatchObject({
        status: 'draft',
        orderId: f.orderId,
        unitCount: 1,
        note: 'First batch',
        files: [],
      });
      expect(note.units.map((unit) => unit.unitId)).toEqual([
        f.passedUnitIds[0],
      ]);
      expect(note.deliveryAddress).toBe(
        (await orderPage(f.orderId)).siteAddress,
      );
      expectNoMoneyKeys(res.body);
    });

    it('refuses a cabinet waiting for QC, one that failed, one of another order and one on a live note, naming the codes', async () => {
      const f = await d.readyOrder({ finished: 3, qcPassed: 1 });
      const other = await d.readyOrder({ finished: 1 });
      const [passed, waiting, failed] = f.unitIds;
      await d.failQc(failed);
      const codes = new Map(
        (await orderPage(f.orderId)).units.map((unit) => [
          unit.unitId,
          unit.code,
        ]),
      );

      const refused = async (unitIds: number[]) => {
        const res = await d.create({ orderId: f.orderId, unitIds }).expect(400);
        return message(res.body);
      };
      expect(await refused([waiting])).toContain(
        `${codes.get(waiting)} (QC waiting)`,
      );
      expect(await refused([failed])).toContain(
        `${codes.get(failed)} (QC failed)`,
      );
      expect(await refused([other.passedUnitIds[0]])).toContain(
        `unit ${other.passedUnitIds[0]}`,
      );
      const first = await noteOf(
        d.create({ orderId: f.orderId, unitIds: [passed] }).expect(201),
      );
      expect(await refused([passed])).toContain(first.code);
      expect(await refused([passed, waiting])).toContain(codes.get(waiting));
    });

    it('answers 409 for an order that is open or delivered and 404 for one that does not exist', async () => {
      const open = await d.h.newOrder();
      const delivered = await d.h.newOrder({ status: 'delivered' });

      await d.create({ orderId: open, unitIds: [1] }).expect(409);
      await d.create({ orderId: delivered, unitIds: [1] }).expect(409);
      await d.create({ orderId: 2147483000, unitIds: [1] }).expect(404);
    });

    it('rejects a body without cabinets or with a malformed date', async () => {
      const f = await d.readyOrder({ finished: 1 });

      await d.create({ orderId: f.orderId, unitIds: [] }).expect(400);
      await d
        .create({
          orderId: f.orderId,
          unitIds: f.passedUnitIds,
          plannedDate: '2026-12-01T10:00:00Z',
        })
        .expect(400);
    });

    it('answers 404 to another sales rep before it says anything about the order status', async () => {
      const open = await d.h.newOrder({ owner: 'sales_a' });

      await withGrant('salesB', ['delivery_note:create'], async () => {
        await d.create({ orderId: open, unitIds: [1] }, 'salesB').expect(404);
      });
      await d.create({ orderId: open, unitIds: [1] }, 'salesA').expect(403);
    });
  });

  describe('transitions', () => {
    it('ships a draft once and refuses to ship it again', async () => {
      const f = await d.readyOrder({ finished: 1 });
      const note = await noteOf(
        d.create({ orderId: f.orderId, unitIds: f.passedUnitIds }).expect(201),
      );

      const shipped = await noteOf(d.ship(note.id).expect(200));
      expect(shipped.status).toBe('shipped');
      expect(shipped.shippedAt).not.toBeNull();
      await d.ship(note.id).expect(409);
    });

    it('receives a shipped note only, with a receiver name and at least one file', async () => {
      const f = await d.readyOrder({ finished: 2 });
      const note = await noteOf(
        d.create({ orderId: f.orderId, unitIds: [f.unitIds[0]] }).expect(201),
      );

      await d.receive(note.id).expect(409);
      // The 409 is decided under the order lock, after the files were stored: they must be gone.
      expect(d.storage.objects.size).toBe(0);
      await d.ship(note.id).expect(200);
      d.storage.upload.mockClear();
      await d.receive(note.id, { receiverName: '   ' }).expect(400);
      await d.receive(note.id, { files: [] }).expect(400);
      expect(d.storage.upload).not.toHaveBeenCalled();
      expect(await d.statusOfNote(note.id)).toBe('shipped');

      const received = await noteOf(d.receive(note.id).expect(200));
      expect(received).toMatchObject({
        status: 'received',
        receiverName: 'Nguyen Van A',
        receivedDate: vnToday(),
      });
      expect(received.files).toHaveLength(1);
      expect(JSON.stringify(received)).not.toContain('delivery/handover');
      expect([...d.storage.objects.keys()]).toEqual([
        expect.stringMatching(
          new RegExp(`^delivery/handover/${note.id}/[0-9a-f-]{36}\\.pdf$`),
        ),
      ]);
      await d.receive(note.id).expect(409);
    });

    it('bounds the received date by the Vietnam date of shipping and by today', async () => {
      const f = await d.readyOrder({ finished: 1 });
      const note = await d.shippedNote(f.orderId, f.passedUnitIds);
      // 18:00Z is already the next day in Vietnam: shipped on `shipDay` there, `shipDay - 1` in UTC.
      const shipDay = addDays(vnToday(), -2);
      await d.setShippedAt(note.id, `${addDays(shipDay, -1)}T18:00:00Z`);

      await d
        .receive(note.id, { receivedDate: addDays(shipDay, -1) })
        .expect(400);
      await d
        .receive(note.id, { receivedDate: addDays(vnToday(), 1) })
        .expect(400);
      expect(await d.statusOfNote(note.id)).toBe('shipped');
      // Both refused after the files were stored: nothing may stay behind.
      expect(d.storage.objects.size).toBe(0);

      await d.receive(note.id, { receivedDate: shipDay }).expect(200);
      expect(await d.statusOfNote(note.id)).toBe('received');
    });

    it('cancels a draft or shipped note, frees its cabinets for a new note, and refuses a received one', async () => {
      const f = await d.readyOrder({ finished: 3 });
      const [a, b, c] = f.unitIds;
      const draft = await noteOf(
        d.create({ orderId: f.orderId, unitIds: [a] }).expect(201),
      );
      const shipped = await d.shippedNote(f.orderId, [b]);
      const received = await d.shippedNote(f.orderId, [c]);
      await d.receive(received.id).expect(200);

      await d.cancel(draft.id, '').expect(400);
      expect((await noteOf(d.cancel(draft.id).expect(200))).status).toBe(
        'cancelled',
      );
      await d.cancel(shipped.id).expect(200);
      await d.cancel(received.id).expect(409);
      await d.cancel(draft.id).expect(409);
      await d.ship(draft.id).expect(409);

      const page = await orderPage(f.orderId);
      expect(
        page.units
          .filter((unit) => unit.unitId !== c)
          .map((unit) => unit.deliveryStatus),
      ).toEqual(['none', 'none']);
      const again = await noteOf(
        d.create({ orderId: f.orderId, unitIds: [a, b] }).expect(201),
      );
      expect(again.unitCount).toBe(2);
    });
  });

  describe('the order becoming delivered', () => {
    it('keeps the order in production until the last cabinet is received, and tells the followers once each', async () => {
      const f = await d.readyOrder({ finished: 2 });
      const first = await d.shippedNote(f.orderId, [f.unitIds[0]]);
      const second = await d.shippedNote(f.orderId, [f.unitIds[1]]);

      await d.receive(first.id).expect(200);

      expect(await d.h.statusOfOrder(f.orderId)).toBe('in_production');
      expect(await d.changes('salesA', f.orderId)).toContain(
        'delivery_received',
      );
      expect(await d.changes('salesA', f.orderId)).not.toContain('delivered');
      const partial = (await d.h.notices('salesA', f.orderId)).find(
        (notice) => notice.payload.change === 'delivery_received',
      );
      expect(partial?.payload.deliveryNoteCode).toBe(first.code);

      await d.receive(second.id).expect(200);

      expect(await d.h.statusOfOrder(f.orderId)).toBe('delivered');
      const notices = await d.h.notices('salesA', f.orderId);
      const delivered = notices.filter((n) => n.payload.change === 'delivered');
      expect(delivered).toHaveLength(1);
      expect(delivered[0].payload.deliveryNoteCode).toBe(second.code);
      expect(
        notices.filter(
          (n) =>
            n.payload.change === 'delivery_received' &&
            n.payload.deliveryNoteCode === second.code,
        ),
      ).toEqual([]);
    });

    it('does not deliver an order whose cabinets are not all on received notes', async () => {
      const f = await d.readyOrder({ finished: 1, total: 2 });
      const note = await d.shippedNote(f.orderId, f.passedUnitIds);

      await d.receive(note.id).expect(200);

      expect(await d.h.statusOfOrder(f.orderId)).toBe('in_production');
    });

    it('writes no stock movement for any delivery step', async () => {
      const f = await d.readyOrder({ finished: 1 });
      const note = await d.shippedNote(f.orderId, f.passedUnitIds);
      await d.receive(note.id).expect(200);

      const [row]: Array<{ n: string }> = await d.h.dataSource.query(
        `SELECT COUNT(*) AS n FROM stock_movements WHERE document_type ILIKE 'delivery%'`,
      );
      expect(Number(row.n)).toBe(0);
    });
  });

  describe('reads', () => {
    it('lists the orders with cabinets ready to deliver, and drops one once its cabinets are on notes', async () => {
      const f = await d.readyOrder({ finished: 1, total: 2 });
      const listed = async () =>
        (
          (await d.get('/delivery/orders/deliverable').expect(200))
            .body as Array<{
            orderId: number;
            code: string;
            customerName: string;
            projectName: string | null;
          }>
        ).map((order) => order.orderId);

      expect(await listed()).toContain(f.orderId);
      const res = await d.get('/delivery/orders/deliverable').expect(200);
      expectNoMoneyKeys(res.body);
      await d
        .create({ orderId: f.orderId, unitIds: f.passedUnitIds })
        .expect(201);
      expect(await listed()).not.toContain(f.orderId);
      await d.get('/delivery/orders/deliverable', 'manager').expect(403);
    });

    it('shows each cabinet with its QC and delivery status and the notes of the order', async () => {
      const f = await d.readyOrder({ finished: 3, qcPassed: 2, total: 4 });
      const draft = await noteOf(
        d.create({ orderId: f.orderId, unitIds: [f.unitIds[0]] }).expect(201),
      );

      const res = await d.get(`/delivery/orders/${f.orderId}`).expect(200);

      const page = res.body as OrderPage;
      expect(
        page.units.map(({ qcStatus, deliveryStatus, deliveryNoteCode }) => [
          qcStatus,
          deliveryStatus,
          deliveryNoteCode,
        ]),
      ).toEqual([
        ['passed', 'draft', draft.code],
        ['passed', 'none', null],
        ['waiting', 'none', null],
        ['not_ready', 'none', null],
      ]);
      expect(page.notes.map((note) => note.code)).toEqual([draft.code]);
      expectNoMoneyKeys(res.body);
    });

    it('lists notes by status and order, a page at a time, and reads one note in full', async () => {
      const f = await d.readyOrder({ finished: 2 });
      const draft = await noteOf(
        d.create({ orderId: f.orderId, unitIds: [f.unitIds[0]] }).expect(201),
      );
      const shipped = await d.shippedNote(f.orderId, [f.unitIds[1]]);

      const all = await d
        .get(`/delivery/notes?orderId=${f.orderId}&limit=1&page=2`)
        .expect(200);
      const shippedOnly = await d
        .get(`/delivery/notes?orderId=${f.orderId}&status=shipped`)
        .expect(200);
      const one = await d.get(`/delivery/notes/${draft.id}`).expect(200);

      const page = all.body as {
        data: NoteBody[];
        meta: { total: number; page: number };
      };
      expect(page.meta).toMatchObject({ total: 2, page: 2 });
      expect(page.data.map((note) => note.code)).toEqual([draft.code]);
      expect(
        (shippedOnly.body as { data: NoteBody[] }).data.map((n) => n.code),
      ).toEqual([shipped.code]);
      expect((one.body as NoteBody).units).toHaveLength(1);
      for (const body of [all.body, shippedOnly.body, one.body]) {
        expectNoMoneyKeys(body);
      }
      await d.get('/delivery/notes/2147483000').expect(404);
    });

    it('hides the notes and the order of another sales rep, and refuses a technician', async () => {
      const f = await d.readyOrder({ finished: 1 });
      const note = await noteOf(
        d.create({ orderId: f.orderId, unitIds: f.passedUnitIds }).expect(201),
      );

      await d.get(`/delivery/notes/${note.id}`, 'salesA').expect(200);
      await d.get(`/delivery/notes/${note.id}`, 'salesB').expect(404);
      await d.get(`/delivery/orders/${f.orderId}`, 'salesB').expect(404);
      const listed = await d
        .get(`/delivery/notes?orderId=${f.orderId}`, 'salesB')
        .expect(200);
      expect((listed.body as { data: unknown[] }).data).toEqual([]);
      await d.get(`/delivery/notes/${note.id}`, 'techA').expect(403);
      await d.get(`/delivery/notes/${note.id}`, 'manager').expect(200);
    });
  });

  describe('the production guards', () => {
    const undo = (unitId: number) =>
      d.h.post(
        `/production/units/${unitId}/stages/finishing/undo`,
        { reason: 'Redo' },
        'manager',
      );
    const cancelProduction = (productionOrderId: number) =>
      d.h.post(
        `/production/orders/${productionOrderId}/cancel`,
        { reason: 'Customer withdrew' },
        'manager',
      );

    it('refuses to undo the finishing of a cabinet on a draft or a received note, until the note is cancelled', async () => {
      const f = await d.readyOrder({ finished: 2, total: 3 });
      const [onDraft, onReceived] = f.passedUnitIds;
      const draft = await noteOf(
        d.create({ orderId: f.orderId, unitIds: [onDraft] }).expect(201),
      );
      const received = await d.shippedNote(f.orderId, [onReceived]);
      await d.receive(received.id).expect(200);

      await undo(onDraft).expect(409);
      await undo(onReceived).expect(409);
      await d.cancel(draft.id).expect(200);
      await undo(onDraft).expect(200);
    });

    it('refuses to cancel a production order with a cabinet on a shipped or a received note, until the notes are cancelled', async () => {
      const f = await d.readyOrder({ finished: 2, total: 3 });
      const shipped = await d.shippedNote(f.orderId, [f.passedUnitIds[0]]);

      await cancelProduction(f.productionOrderId).expect(409);
      const received = await d.shippedNote(f.orderId, [f.passedUnitIds[1]]);
      await d.receive(received.id).expect(200);
      await d.cancel(shipped.id).expect(200);
      await cancelProduction(f.productionOrderId).expect(409);
      expect(await d.h.statusOfProduction(f.productionOrderId)).toBe(
        'released',
      );
    });

    it('lets production cancel once every note of its cabinets is cancelled', async () => {
      const f = await d.readyOrder({ finished: 1, total: 2 });
      const note = await d.shippedNote(f.orderId, f.passedUnitIds);
      await d.cancel(note.id).expect(200);

      await cancelProduction(f.productionOrderId).expect(200);
      expect(await d.h.statusOfProduction(f.productionOrderId)).toBe(
        'cancelled',
      );
    });
  });
});

/**
 * The receipt of the last cabinet through the endpoint with inventory's real reservation hook on
 * the order lifecycle: the delivered order must give its stock back and no longer hold demand
 * when the hook runs, so the freed stock goes to the order that is short, and that order's
 * shortage notice is closed after the commit.
 */
describeWithDatabase(
  'Delivery receipt and reservations (real Postgres)',
  () => {
    jest.setTimeout(180_000);

    let d: DeliveryHarness;
    let db: InventoryDb;
    let reservations: ReservationService;
    let alerts: ShortageAlertService;
    const orderIds: number[] = [];

    beforeAll(async () => {
      d = await openDeliveryHarness();
      db = await openInventoryDb();
      const orders = new OrderMaterialReadPort();
      // Emit, close, release and find use only the notification table.
      const notifications = new NotificationService(
        db.dataSource.getRepository(Notification),
        null as never,
        null as never,
      );
      alerts = new ShortageAlertService(
        db.dataSource,
        orders,
        notifications,
        new StockAlertService(db.dataSource, notifications),
      );
      reservations = new ReservationService(
        db.posting,
        orders,
        d.h.lifecycle,
        alerts,
      );
      reservations.onModuleInit();
    });

    afterAll(async () => {
      if (orderIds.length > 0) {
        await db.dataSource.query(
          `DELETE FROM notifications WHERE event_type LIKE 'inventory.order.short%'
           AND (payload->>'orderId')::int = ANY($1)`,
          [orderIds],
        );
        await db.dataSource.query(
          `DELETE FROM stock_reservations WHERE order_id = ANY($1)`,
          [orderIds],
        );
      }
      // The orders name the item through their BOM lines: they go before the item does.
      await d?.close();
      await db?.close();
    });

    const reserve = async (orderId: number) => {
      const change = await db.dataSource.transaction((manager) =>
        reservations.reserveForOrder(manager, orderId),
      );
      await alerts.afterCommit([orderId, ...change.orderIds], change.itemIds);
    };
    const reservationsOf = async (itemId: number) => {
      const rows: Array<{ order_id: number; quantity: string }> =
        await db.dataSource.query(
          `SELECT order_id, trim_scale(quantity)::text AS quantity
           FROM stock_reservations WHERE item_id = $1`,
          [itemId],
        );
      return Object.fromEntries(
        rows.map((row) => [row.order_id, row.quantity]),
      );
    };
    const openShortageNotices = async (orderId: number) => {
      const rows: Array<{ event_type: string }> = await db.dataSource.query(
        `SELECT event_type FROM notifications
        WHERE event_type LIKE 'inventory.order.short%' AND status = 'open'
          AND dedupe_key IS NOT NULL AND (payload->>'orderId')::int = $1`,
        [orderId],
      );
      return rows.length;
    };

    it('releases the delivered order and hands its stock to the short order, closing the notice', async () => {
      const item = await db.createItem();
      await db.post({
        documentType: 'spec_opening',
        documentId: item,
        lines: [
          {
            itemId: item,
            movementType: StockMovementType.RECEIPT,
            quantity: '10',
            unitCost: 1000,
          },
        ],
      });
      const bom = [{ itemId: item, quantity: '6' }];
      const first = await d.readyOrder({ finished: 1, bom });
      const second = await d.readyOrder({ finished: 1, bom });
      orderIds.push(first.orderId, second.orderId);
      await reserve(first.orderId);
      await reserve(second.orderId);
      expect(await reservationsOf(item)).toEqual({
        [first.orderId]: '6',
        [second.orderId]: '4',
      });
      expect(await openShortageNotices(second.orderId)).toBeGreaterThan(0);

      const note = await d.shippedNote(first.orderId, first.unitIds);
      await d.receive(note.id).expect(200);

      expect(await d.h.statusOfOrder(first.orderId)).toBe('delivered');
      expect(await reservationsOf(item)).toEqual({ [second.orderId]: '6' });
      expect(await openShortageNotices(second.orderId)).toBe(0);
    });
  },
);
