import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import {
  DELIVERY_NOTE_CODE_INDEX,
  DELIVERY_NOTE_CODE_PREFIX,
  DELIVERY_NOTE_TABLE,
  DeliveryNoteStatus,
} from '@plugins/delivery/delivery-note/constants/delivery-note.constant';
import {
  CancelDeliveryNoteDto,
  CreateDeliveryNoteDto,
  ReceiveDeliveryNoteDto,
} from '@plugins/delivery/delivery-note/dto/delivery-note.dto';
import {
  DeliveryNoteAccess,
  NOTE_NOT_FOUND,
  ORDER_NOT_FOUND,
} from '@plugins/delivery/delivery-note/services/delivery-note-access.service';
import { DeliveryNoteQueryService } from '@plugins/delivery/delivery-note/services/delivery-note-query.service';
import {
  liveLines,
  qcRoundSummaries,
  type DeliveryNoteDetail,
  type RawRow,
} from '@plugins/delivery/delivery-note/services/delivery-note-views';
import { QcUnitStatus } from '@plugins/delivery/qc-inspection/constants/qc-inspection.constant';
import { qcStatusOf } from '@plugins/delivery/qc-inspection/services/qc-inspection.service';
import {
  ProductionUnitPort,
  type ProductionUnitView,
} from '@plugins/production/_shared/ports/production-unit.port';
import { vnToday } from '@plugins/production/_shared/utils/vn-today.util';
import {
  OrderLifecycleRegistry,
  type PendingOrderLifecycle,
} from '@plugins/sales/_shared/ports/order-lifecycle-registry';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';
import { OrderFollowerNotifier } from '@plugins/sales/_shared/services/order-follower-notifier';
import { createWithDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';
import { OrderStatus } from '@plugins/sales/order/enums/order-status.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/** A handover file already in storage, waiting for its row. */
export interface StoredHandoverFile {
  key: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

interface LockedNote {
  code: string;
  status: DeliveryNoteStatus;
  shippedAt: Date | null;
}

const MAX_RECEIPT_FILES = 5;

/**
 * Writes of delivery notes. Every one takes the order row first (global lock order: order →
 * production order → cabinets → delivery rows → stock), checks the actor's scope on it (404
 * before any status answer), and only then reads the note `FOR UPDATE`, so the statuses and
 * counts it decides on cannot move under it. The last receipt moves the order to `delivered`
 * in the same transaction, and the release of its reservations follows the move.
 */
@Injectable()
export class DeliveryNoteService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: DeliveryNoteAccess,
    private readonly orders: OrderProductionPort,
    private readonly units: ProductionUnitPort,
    private readonly lifecycle: OrderLifecycleRegistry,
    private readonly followers: OrderFollowerNotifier,
    private readonly queries: DeliveryNoteQueryService,
  ) {}

  async create(
    dto: CreateDeliveryNoteDto,
    actor: AuthUserPayload,
  ): Promise<DeliveryNoteDetail> {
    const id = await createWithDocumentCode(
      this.dataSource,
      {
        table: DELIVERY_NOTE_TABLE,
        prefix: DELIVERY_NOTE_CODE_PREFIX,
        codeUniqueIndex: DELIVERY_NOTE_CODE_INDEX,
        exhaustedMessage:
          'Could not allocate a delivery note code, please try again.',
      },
      async (manager, code) => {
        const order = await this.orders.lockForProduction(manager, dto.orderId);
        if (!order) throw new NotFoundException(ORDER_NOT_FOUND);
        await this.access.assertOrderVisible(
          manager,
          actor,
          order.id,
          ORDER_NOT_FOUND,
        );
        if ((order.status as OrderStatus) !== OrderStatus.IN_PRODUCTION) {
          throw new ConflictException(
            `Order ${order.code} is ${order.status}; only an in_production order can be delivered.`,
          );
        }
        const cabinets = await this.units.lockOrderUnits(manager, order.id);
        const chosen = await this.deliverable(manager, cabinets, dto.unitIds);

        const address =
          dto.deliveryAddress ||
          (await this.orders.siteAddress(manager, order.id));
        const [note]: Array<{ id: number }> = await manager.query(
          `INSERT INTO delivery_notes
             (code, order_id, status, planned_date, delivery_address, note, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
          [
            code,
            order.id,
            DeliveryNoteStatus.DRAFT,
            dto.plannedDate ?? null,
            address,
            dto.note || null,
            actor.userId,
          ],
        );
        await manager.query(
          `INSERT INTO delivery_note_units (note_id, unit_id, unit_code, created_by, updated_by)
           SELECT $1, t.unit_id, t.unit_code, $2, $2
             FROM unnest($3::int[], $4::text[]) AS t(unit_id, unit_code)`,
          [
            note.id,
            actor.userId,
            chosen.map((unit) => unit.unitId),
            chosen.map((unit) => unit.code),
          ],
        );
        return note.id;
      },
    );
    return this.queries.getNote(id, actor);
  }

  async ship(id: number, actor: AuthUserPayload): Promise<DeliveryNoteDetail> {
    await this.writeNote(id, actor, async (manager, note) => {
      this.assertStatus(note, [DeliveryNoteStatus.DRAFT], 'shipped');
      await manager.query(
        `UPDATE delivery_notes
            SET status = $2, shipped_at = NOW(), shipped_by = $3, updated_by = $3, updated_at = NOW()
          WHERE id = $1`,
        [id, DeliveryNoteStatus.SHIPPED, actor.userId],
      );
    });
    return this.queries.getNote(id, actor);
  }

  /** Frees the cabinets at once: the status and `active = false` change in one transaction. */
  async cancel(
    id: number,
    dto: CancelDeliveryNoteDto,
    actor: AuthUserPayload,
  ): Promise<DeliveryNoteDetail> {
    await this.writeNote(id, actor, async (manager, note) => {
      this.assertStatus(
        note,
        [DeliveryNoteStatus.DRAFT, DeliveryNoteStatus.SHIPPED],
        'cancelled',
      );
      await manager.query(
        `UPDATE delivery_notes
            SET status = $2, cancel_reason = $3, cancelled_at = NOW(), cancelled_by = $4,
                updated_by = $4, updated_at = NOW()
          WHERE id = $1`,
        [id, DeliveryNoteStatus.CANCELLED, dto.reason, actor.userId],
      );
      await manager.query(
        `UPDATE delivery_note_units
            SET active = false, updated_by = $2, updated_at = NOW()
          WHERE note_id = $1`,
        [id, actor.userId],
      );
    });
    return this.queries.getNote(id, actor);
  }

  /**
   * Records the receipt of a shipped note whose handover files are already stored. The
   * receipt that leaves no cabinet of the live production order un-received moves the order to
   * `delivered` — first the move, then the lifecycle hooks, so the order is no longer demand
   * bearing when its reservations are released. Followers are told after the commit.
   */
  async receive(
    noteId: number,
    dto: ReceiveDeliveryNoteDto,
    files: readonly StoredHandoverFile[],
    actor: AuthUserPayload,
  ): Promise<void> {
    const orderId = await this.access.orderOfNote(
      this.dataSource.manager,
      noteId,
    );
    const done = await this.dataSource.transaction(async (manager) => {
      const note = await this.lockNote(manager, noteId, orderId, actor);
      this.assertStatus(note, [DeliveryNoteStatus.SHIPPED], 'received');
      if (files.length < 1 || files.length > MAX_RECEIPT_FILES) {
        throw new BadRequestException(
          `A receipt needs 1 to ${MAX_RECEIPT_FILES} handover files.`,
        );
      }
      if (dto.receivedDate > vnToday()) {
        throw new BadRequestException(
          'The received date cannot be in the future.',
        );
      }
      if (note.shippedAt && dto.receivedDate < vnToday(note.shippedAt)) {
        throw new BadRequestException(
          'The received date cannot be before the shipping date.',
        );
      }
      await manager.query(
        `UPDATE delivery_notes
            SET status = $2, received_date = $3, receiver_name = $4, received_by = $5,
                updated_by = $5, updated_at = NOW()
          WHERE id = $1`,
        [
          noteId,
          DeliveryNoteStatus.RECEIVED,
          dto.receivedDate,
          dto.receiverName,
          actor.userId,
        ],
      );
      await manager.query(
        `INSERT INTO delivery_note_files
           (note_id, storage_key, content_type, file_name, size_bytes, created_by, updated_by)
         SELECT $1, t.storage_key, t.content_type, t.file_name, t.size_bytes, $2, $2
           FROM unnest($3::text[], $4::text[], $5::text[], $6::int[])
                AS t(storage_key, content_type, file_name, size_bytes)`,
        [
          noteId,
          actor.userId,
          files.map((file) => file.key),
          files.map((file) => file.contentType),
          files.map((file) => file.fileName),
          files.map((file) => file.sizeBytes),
        ],
      );
      // Counted under the order lock: another receipt of this order commits before or after.
      const [{ remaining }]: Array<{ remaining: string }> = await manager.query(
        `SELECT COUNT(*) AS remaining
           FROM production_units u
           JOIN production_orders po ON po.id = u.production_order_id
          WHERE po.order_id = $1 AND po.is_deleted = false AND po.status <> 'cancelled'
            AND u.is_deleted = false
            AND NOT EXISTS (
              SELECT 1 FROM delivery_note_units du JOIN delivery_notes n ON n.id = du.note_id
               WHERE du.unit_id = u.id AND du.active = true AND du.is_deleted = false
                 AND n.status = $2)`,
        [orderId, DeliveryNoteStatus.RECEIVED],
      );
      let pending: PendingOrderLifecycle | null = null;
      if (Number(remaining) === 0) {
        await this.orders.moveStatus(
          manager,
          orderId,
          OrderStatus.IN_PRODUCTION,
          OrderStatus.DELIVERED,
        );
        pending = await this.lifecycle.delivered(manager, {
          orderId,
          actorId: actor.userId,
        });
      }
      return { code: note.code, pending };
    });
    await done.pending?.afterCommit();
    await this.followers.notify(
      orderId,
      done.pending ? 'delivered' : 'delivery_received',
      actor.userId,
      { extra: { deliveryNoteCode: done.code } },
    );
  }

  /** A write of one note under its locks; `change` decides on the locked state. */
  private async writeNote(
    id: number,
    actor: AuthUserPayload,
    change: (manager: EntityManager, note: LockedNote) => Promise<void>,
  ): Promise<void> {
    const orderId = await this.access.orderOfNote(this.dataSource.manager, id);
    await this.dataSource.transaction(async (manager) =>
      change(manager, await this.lockNote(manager, id, orderId, actor)),
    );
  }

  /** Order row, then scope, then the note: the 404s come before any status answer. */
  private async lockNote(
    manager: EntityManager,
    noteId: number,
    orderId: number,
    actor: AuthUserPayload,
  ): Promise<LockedNote> {
    const order = await this.orders.lockForProduction(manager, orderId);
    if (!order) throw new NotFoundException(NOTE_NOT_FOUND);
    await this.access.assertOrderVisible(
      manager,
      actor,
      orderId,
      NOTE_NOT_FOUND,
    );
    const [row]: RawRow[] = await manager.query(
      `SELECT code, status, shipped_at FROM delivery_notes
        WHERE id = $1 AND is_deleted = false FOR UPDATE`,
      [noteId],
    );
    if (!row) throw new NotFoundException(NOTE_NOT_FOUND);
    return {
      code: String(row.code),
      status: row.status as DeliveryNoteStatus,
      shippedAt: row.shipped_at instanceof Date ? row.shipped_at : null,
    };
  }

  private assertStatus(
    note: LockedNote,
    allowed: readonly DeliveryNoteStatus[],
    target: string,
  ): void {
    if (!allowed.includes(note.status)) {
      throw new ConflictException(
        `Delivery note ${note.code} is ${note.status} and cannot become ${target}.`,
      );
    }
  }

  /**
   * The requested cabinets, once every one is a cabinet of the order's live production order,
   * has passed QC and is on no live note; otherwise a 400 naming the codes. Runs under the
   * order and cabinet locks, so no other note can take a cabinet meanwhile.
   */
  private async deliverable(
    manager: EntityManager,
    cabinets: readonly ProductionUnitView[],
    unitIds: readonly number[],
  ): Promise<ProductionUnitView[]> {
    const byId = new Map(cabinets.map((unit) => [unit.unitId, unit]));
    const rounds = await qcRoundSummaries(manager, unitIds);
    const lines = await liveLines(manager, unitIds);
    const chosen: ProductionUnitView[] = [];
    const refused: string[] = [];
    for (const unitId of unitIds) {
      const unit = byId.get(unitId);
      if (!unit) {
        refused.push(`unit ${unitId} (not a cabinet of this order)`);
        continue;
      }
      const line = lines.get(unitId);
      const qc = qcStatusOf(unit, rounds.get(unitId));
      if (line) {
        refused.push(
          `${unit.code} (already on delivery note ${line.noteCode})`,
        );
      } else if (qc !== QcUnitStatus.PASSED) {
        refused.push(`${unit.code} (QC ${qc})`);
      } else {
        chosen.push(unit);
      }
    }
    if (refused.length > 0) {
      throw new BadRequestException(
        `These cabinets cannot be delivered: ${refused.join(', ')}.`,
      );
    }
    return chosen;
  }
}
