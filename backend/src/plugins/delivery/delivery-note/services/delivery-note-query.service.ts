import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { resolvePagination } from '@shared/utils/pagination.util';

import { DeliveryNoteFilterDto } from '@plugins/delivery/delivery-note/dto/delivery-note.dto';
import {
  DeliveryNoteAccess,
  NOTE_NOT_FOUND,
  ORDER_NOT_FOUND,
} from '@plugins/delivery/delivery-note/services/delivery-note-access.service';
import {
  FILE_SELECT,
  liveLines,
  NOTE_SELECT,
  qcRoundSummaries,
  toFileView,
  toNoteSummary,
  type DeliveryNoteDetail,
  type DeliveryNoteSummary,
  type DeliveryOrderUnit,
  type RawRow,
} from '@plugins/delivery/delivery-note/services/delivery-note-views';
import { qcStatusOf } from '@plugins/delivery/qc-inspection/services/qc-inspection.service';
import { ProductionUnitPort } from '@plugins/production/_shared/ports/production-unit.port';
import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';
import { OrderStatus } from '@plugins/sales/order/enums/order-status.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

export interface DeliverableOrder {
  orderId: number;
  code: string;
  customerName: string;
  projectName: string | null;
}

export interface DeliveryOrderDetail extends DeliverableOrder {
  status: string;
  /** Prefill of a new note's address: the project site, else the customer address. */
  siteAddress: string | null;
  units: DeliveryOrderUnit[];
  notes: DeliveryNoteSummary[];
}

/**
 * Every read of delivery notes. The actor's scope is a condition in SQL on the order id, so a
 * note or order outside it answers 404 like one that does not exist.
 */
@Injectable()
export class DeliveryNoteQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: DeliveryNoteAccess,
    private readonly units: ProductionUnitPort,
    private readonly headers: OrderMaterialReadPort,
    private readonly orders: OrderProductionPort,
  ) {}

  /** `in_production` orders with at least one cabinet that QC passed and no live note holds. */
  async listDeliverableOrders(
    actor: AuthUserPayload,
  ): Promise<DeliverableOrder[]> {
    const manager = this.dataSource.manager;
    const finished = (
      await this.units.listUnits(manager, {
        orderScope: this.access.orderScope(actor),
        finishingDone: true,
      })
    ).filter(
      (unit) => unit.productionOrderStatus !== ProductionOrderStatus.CANCELLED,
    );
    const ids = finished.map((unit) => unit.unitId);
    const rounds = await qcRoundSummaries(manager, ids);
    const lines = await liveLines(manager, ids);
    const orderIds = [
      ...new Set(
        finished
          .filter(
            (unit) =>
              rounds.get(unit.unitId)?.passed && !lines.has(unit.unitId),
          )
          .map((unit) => unit.orderId),
      ),
    ].sort((a, b) => a - b);
    const headers = await this.headers.getOrders(manager, orderIds);
    return orderIds.flatMap((orderId) => {
      const header = headers.get(orderId);
      return header?.status === OrderStatus.IN_PRODUCTION
        ? [
            {
              orderId,
              code: header.code,
              customerName: header.customerName,
              projectName: header.projectName,
            },
          ]
        : [];
    });
  }

  async getOrder(
    orderId: number,
    actor: AuthUserPayload,
  ): Promise<DeliveryOrderDetail> {
    const manager = this.dataSource.manager;
    await this.access.assertOrderVisible(
      manager,
      actor,
      orderId,
      ORDER_NOT_FOUND,
    );
    const header = await this.headers.getOrder(manager, orderId);
    if (!header) throw new NotFoundException(ORDER_NOT_FOUND);
    const units = (
      await this.units.listUnits(manager, {
        orderScope: this.access.orderScope(actor),
        orderId,
      })
    ).filter(
      (unit) => unit.productionOrderStatus !== ProductionOrderStatus.CANCELLED,
    );
    const ids = units.map((unit) => unit.unitId);
    const rounds = await qcRoundSummaries(manager, ids);
    const lines = await liveLines(manager, ids);
    const noteRows: RawRow[] = await manager.query(
      `${NOTE_SELECT} WHERE n.order_id = $1 AND n.is_deleted = false ORDER BY n.id`,
      [orderId],
    );
    return {
      orderId,
      code: header.code,
      status: header.status,
      customerName: header.customerName,
      projectName: header.projectName,
      siteAddress: await this.orders.siteAddress(manager, orderId),
      units: units.map((unit) => {
        const line = lines.get(unit.unitId);
        return {
          unitId: unit.unitId,
          code: unit.code,
          tag: unit.tag,
          description: unit.description,
          qcStatus: qcStatusOf(unit, rounds.get(unit.unitId)),
          deliveryStatus: line?.status ?? 'none',
          deliveryNoteCode: line?.noteCode ?? null,
        };
      }),
      notes: noteRows.map((row) => toNoteSummary(row, header)),
    };
  }

  async listNotes(query: DeliveryNoteFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const manager = this.dataSource.manager;
    const reach = this.access.orderScope(actor)('n.order_id');
    const params: unknown[] = [...reach.params];
    const where = ['n.is_deleted = false', reach.sql];
    if (query.status) {
      params.push(query.status);
      where.push(`n.status = $${params.length}`);
    }
    if (query.orderId !== undefined) {
      params.push(query.orderId);
      where.push(`n.order_id = $${params.length}`);
    }
    const condition = where.map((part) => `(${part})`).join(' AND ');
    const [{ total }]: Array<{ total: string }> = await manager.query(
      `SELECT COUNT(*) AS total FROM delivery_notes n WHERE ${condition}`,
      params,
    );
    const rows: RawRow[] = await manager.query(
      `${NOTE_SELECT} WHERE ${condition} ORDER BY n.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, skip],
    );
    const orders = await this.headers.getOrders(
      manager,
      rows.map((row) => Number(row.order_id)),
    );
    return paginate(
      rows.map((row) => toNoteSummary(row, orders.get(Number(row.order_id)))),
      Number(total),
      page,
      limit,
    );
  }

  async getNote(
    noteId: number,
    actor: AuthUserPayload,
  ): Promise<DeliveryNoteDetail> {
    const manager = this.dataSource.manager;
    const reach = this.access.orderScope(actor)('n.order_id');
    const [row]: RawRow[] = await manager.query(
      `${NOTE_SELECT}
        WHERE n.id = $${reach.params.length + 1} AND n.is_deleted = false AND (${reach.sql})`,
      [...reach.params, noteId],
    );
    if (!row) throw new NotFoundException(NOTE_NOT_FOUND);
    const units: RawRow[] = await manager.query(
      `SELECT unit_id, unit_code FROM delivery_note_units
        WHERE note_id = $1 AND is_deleted = false ORDER BY id`,
      [noteId],
    );
    const files: RawRow[] = await manager.query(
      `${FILE_SELECT} WHERE f.note_id = $1 AND f.is_deleted = false ORDER BY f.id`,
      [noteId],
    );
    const header = await this.headers.getOrder(manager, Number(row.order_id));
    return {
      ...toNoteSummary(row, header),
      units: units.map((unit) => ({
        unitId: Number(unit.unit_id),
        code: String(unit.unit_code),
      })),
      files: files.map(toFileView),
    };
  }
}
