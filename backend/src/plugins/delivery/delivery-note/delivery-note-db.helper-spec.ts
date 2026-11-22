import request from 'supertest';

import { S3StorageService } from '@shared/services/s3-storage.service';

import {
  PDF,
  storageFake,
  type StorageFake,
} from '@plugins/delivery/_shared/delivery-storage.helper-spec';
import { DELIVERY_NOTE_GUARD_NAME } from '@plugins/delivery/delivery-note/constants/delivery-note.constant';
import { DeliveryNoteFileController } from '@plugins/delivery/delivery-note/delivery-note-file.controller';
import { DeliveryNoteController } from '@plugins/delivery/delivery-note/delivery-note.controller';
import { DeliveryNoteFile } from '@plugins/delivery/delivery-note/entities/delivery-note-file.entity';
import { DeliveryNoteUnit } from '@plugins/delivery/delivery-note/entities/delivery-note-unit.entity';
import { DeliveryNote } from '@plugins/delivery/delivery-note/entities/delivery-note.entity';
import { DeliveryNoteAccess } from '@plugins/delivery/delivery-note/services/delivery-note-access.service';
import { DeliveryNoteFileService } from '@plugins/delivery/delivery-note/services/delivery-note-file.service';
import { deliveryNoteGuards } from '@plugins/delivery/delivery-note/services/delivery-note-guards';
import { DeliveryNoteQueryService } from '@plugins/delivery/delivery-note/services/delivery-note-query.service';
import { DeliveryNoteService } from '@plugins/delivery/delivery-note/services/delivery-note.service';
import { QC_CHECKLIST_LOCK_KEY } from '@plugins/delivery/qc-checklist/constants/qc-checklist.constant';
import { QcInspectionController } from '@plugins/delivery/qc-inspection/qc-inspection.controller';
import { QcDefectService } from '@plugins/delivery/qc-inspection/services/qc-defect.service';
import { QcInspectionService } from '@plugins/delivery/qc-inspection/services/qc-inspection.service';
import { QcNotifier } from '@plugins/delivery/qc-inspection/services/qc-notifier.service';
import {
  openHarnessWithProgress,
  type ProductionTestActor,
  type ProductionTestHarness,
} from '@plugins/production/_shared/finished-unit-kit.helper-spec';
import { ProductionGuardRegistry } from '@plugins/production/_shared/ports/production-guard.registry';
import { vnToday } from '@plugins/production/_shared/utils/vn-today.util';
import { PRODUCTION_STAGES } from '@plugins/production/production-order/enums/production-stage.enum';

import type { FixtureBomLine } from '@plugins/sales/_shared/ports/order-material-fixture.helper-spec';

/** A released production order of `quantity` cabinets, all assigned to the technician. */
async function releasedProduction(
  h: ProductionTestHarness,
  quantity: number,
  bomLines: FixtureBomLine[],
) {
  const orderId = await h.newOrder({
    panels: [{ tag: 'MSB', quantity, bomLines }],
  });
  const created = await h.createProduction(orderId).expect(201);
  const id = (created.body as { id: number }).id;
  await h.prepare(id);
  await h.post(`/production/orders/${id}/release`, {}).expect(200);
  return { orderId, id, units: await h.units(id) };
}

/** Starts and finishes the six stages of a cabinet in order, as its technician. */
async function finishUnit(h: ProductionTestHarness, unitId: number) {
  for (const stage of PRODUCTION_STAGES) {
    for (const action of ['start', 'finish']) {
      await h
        .post(
          `/production/units/${unitId}/stages/${stage}/${action}`,
          {},
          'techA',
        )
        .expect(200);
    }
  }
}

/** An order in production whose cabinets are finished and (the first `passed` of them) QC-passed. */
export interface DeliveryFixture {
  orderId: number;
  /** Production order id. */
  productionOrderId: number;
  /** Every cabinet of the production order, by id. */
  unitIds: number[];
  /** The cabinets whose QC passed. */
  passedUnitIds: number[];
  /** The cabinets whose finishing is still pending. */
  openUnitIds: number[];
}

export interface ReceiveBody {
  receiverName?: string;
  receivedDate?: string;
  files?: Array<{ name: string; bytes: Buffer }>;
}

export interface DeliveryHarness {
  h: ProductionTestHarness;
  /** Object storage in memory, as the receive service sees it. */
  storage: StorageFake;
  /**
   * A released production order of `total` cabinets, the first `finished` run through every
   * stage and (the first `qcPassed` of them) QC-passed. With `finished < total` the production order stays released; with
   * `finished === total` it completes, and the order stays in production.
   */
  readyOrder(spec: {
    finished: number;
    total?: number;
    /** How many of the finished cabinets get a passing round; the rest wait for QC. */
    qcPassed?: number;
    /** Material per panel, for the specs that look at reservations. */
    bom?: Array<{ itemId: number; quantity: string }>;
  }): Promise<DeliveryFixture>;
  /** A failing round on a finished cabinet: its first checklist item fails. */
  failQc(unitId: number): Promise<void>;
  create(body: object, as?: ProductionTestActor): request.Test;
  ship(id: number, as?: ProductionTestActor): request.Test;
  cancel(id: number, reason?: string, as?: ProductionTestActor): request.Test;
  /** Multipart receive; the body defaults to a valid receipt of today with one PDF. */
  receive(
    id: number,
    body?: ReceiveBody,
    as?: ProductionTestActor,
  ): request.Test;
  /** Creates a note of the cabinets and ships it; asserts both succeeded. */
  shippedNote(
    orderId: number,
    unitIds: number[],
  ): Promise<{ id: number; code: string }>;
  get(path: string, as?: ProductionTestActor): request.Test;
  /** Sets the time a note was shipped, so the date bounds can be tried around midnight. */
  setShippedAt(noteId: number, at: string): Promise<void>;
  statusOfNote(noteId: number): Promise<string>;
  /** `change` values of the order's follower notices as the actor reads them. */
  changes(as: ProductionTestActor, orderId: number): Promise<string[]>;
  close(): Promise<void>;
}

/** Calendar date arithmetic on a `YYYY-MM-DD` text, in UTC so no zone shifts it. */
export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/**
 * The production harness with the QC and delivery note features mounted and only the delivery
 * note guards registered, the way the delivery note module registers them in the app. Named
 * `*.helper-spec.ts` so the production build leaves it out and jest does not run it as a test.
 */
export async function openDeliveryHarness(): Promise<DeliveryHarness> {
  const storage = storageFake();
  const h = await openHarnessWithProgress(
    [DeliveryNote, DeliveryNoteUnit, DeliveryNoteFile],
    {
      controllers: [
        QcInspectionController,
        DeliveryNoteController,
        DeliveryNoteFileController,
      ],
      providers: [
        QcInspectionService,
        QcDefectService,
        QcNotifier,
        DeliveryNoteAccess,
        DeliveryNoteQueryService,
        DeliveryNoteService,
        DeliveryNoteFileService,
        { provide: S3StorageService, useValue: storage },
      ],
    },
  );
  h.app
    .get(ProductionGuardRegistry)
    .register(DELIVERY_NOTE_GUARD_NAME, deliveryNoteGuards);
  const orderIds: number[] = [];
  const unitIds: number[] = [];

  /** Rounds on every active item, while no other suite edits the shared template. */
  const recordRounds = async (ids: readonly number[], failing = false) => {
    const holder = h.dataSource.createQueryRunner();
    await holder.connect();
    try {
      await holder.query(`SELECT pg_advisory_lock_shared(hashtext($1))`, [
        QC_CHECKLIST_LOCK_KEY,
      ]);
      const items: Array<{ id: number }> = await h.dataSource.query(
        `SELECT id FROM qc_checklist_items
          WHERE is_deleted = false AND active = true ORDER BY position, id`,
      );
      for (const unitId of ids) {
        await h
          .post(
            `/delivery/qc/units/${unitId}/rounds`,
            {
              results: items.map(({ id }, index) =>
                failing && index === 0
                  ? { checklistItemId: id, result: 'fail', note: 'Scratched' }
                  : { checklistItemId: id, result: 'pass' },
              ),
            },
            'qcInspector',
          )
          .expect(201);
      }
    } finally {
      await holder.query(`SELECT pg_advisory_unlock_shared(hashtext($1))`, [
        QC_CHECKLIST_LOCK_KEY,
      ]);
      await holder.release();
    }
  };

  const harness: DeliveryHarness = {
    h,
    storage,
    async readyOrder({
      finished,
      total = finished,
      qcPassed = finished,
      bom = [],
    }) {
      const order = await releasedProduction(
        h,
        total,
        bom.map(({ itemId, quantity }) => ({
          itemId,
          itemCode: `I${itemId}`,
          quantity,
        })),
      );
      orderIds.push(order.orderId);
      const ids = order.units.map((unit) => unit.id);
      unitIds.push(...ids);
      for (const unitId of ids.slice(0, finished)) await finishUnit(h, unitId);
      const passed = ids.slice(0, qcPassed);
      await recordRounds(passed);
      return {
        orderId: order.orderId,
        productionOrderId: order.id,
        unitIds: ids,
        passedUnitIds: passed,
        openUnitIds: ids.slice(finished),
      };
    },
    failQc: (unitId) => recordRounds([unitId], true),
    create: (body, as = 'storekeeper') => h.post('/delivery/notes', body, as),
    ship: (id, as = 'storekeeper') =>
      h.post(`/delivery/notes/${id}/ship`, {}, as),
    cancel: (id, reason = 'Customer postponed', as = 'storekeeper') =>
      h.post(`/delivery/notes/${id}/cancel`, { reason }, as),
    receive(id, body = {}, as = 'storekeeper') {
      const req = request(h.app.getHttpServer())
        .post(`/delivery/notes/${id}/receive`)
        .set('x-test-actor', h.token(as));
      const fields = {
        receiverName: 'Nguyen Van A',
        receivedDate: vnToday(),
        ...body,
      };
      for (const key of ['receiverName', 'receivedDate'] as const) {
        const value = fields[key];
        if (value !== undefined) req.field(key, value);
      }
      for (const file of body.files ?? [{ name: 'minutes.pdf', bytes: PDF }]) {
        req.attach('files', file.bytes, file.name);
      }
      return req;
    },
    async shippedNote(orderId, ids) {
      const created = await harness
        .create({ orderId, unitIds: ids })
        .expect(201);
      const note = created.body as { id: number; code: string };
      await harness.ship(note.id).expect(200);
      return note;
    },
    get: (path, as = 'storekeeper') => h.get(path, as),
    async setShippedAt(noteId, at) {
      await h.dataSource.query(
        `UPDATE delivery_notes SET shipped_at = $2 WHERE id = $1`,
        [noteId, at],
      );
    },
    async statusOfNote(noteId) {
      const [row]: Array<{ status: string }> = await h.dataSource.query(
        `SELECT status FROM delivery_notes WHERE id = $1`,
        [noteId],
      );
      return row.status;
    },
    async changes(as, orderId) {
      return (await h.notices(as, orderId))
        .map((notice) => notice.payload.change)
        .filter((change): change is string => typeof change === 'string');
    },
    async close() {
      if (orderIds.length > 0) {
        const notes = `SELECT id FROM delivery_notes WHERE order_id = ANY($1)`;
        await h.dataSource.query(
          `DELETE FROM delivery_note_files WHERE note_id IN (${notes})`,
          [orderIds],
        );
        await h.dataSource.query(
          `DELETE FROM delivery_note_units WHERE note_id IN (${notes})`,
          [orderIds],
        );
        await h.dataSource.query(
          `DELETE FROM delivery_notes WHERE order_id = ANY($1)`,
          [orderIds],
        );
      }
      if (unitIds.length > 0) {
        await h.dataSource.query(
          `DELETE FROM notifications
            WHERE event_type LIKE 'qc.unit.%' AND (payload->>'unitId')::int = ANY($1)`,
          [unitIds],
        );
        await h.dataSource.query(
          `DELETE FROM qc_defects WHERE unit_id = ANY($1)`,
          [unitIds],
        );
        await h.dataSource.query(
          `DELETE FROM qc_round_items
            WHERE round_id IN (SELECT id FROM qc_rounds WHERE unit_id = ANY($1))`,
          [unitIds],
        );
        await h.dataSource.query(
          `DELETE FROM qc_rounds WHERE unit_id = ANY($1)`,
          [unitIds],
        );
      }
      await h.close();
    },
  };
  return harness;
}
