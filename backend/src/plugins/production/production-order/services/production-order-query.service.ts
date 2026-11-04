import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import {
  DataScopeService,
  materialListCondition,
} from '@shared/services/data-scope.service';
import { resolvePagination } from '@shared/utils/pagination.util';

import {
  OrderShortagePort,
  type OrderShortItem,
} from '@plugins/inventory/_shared/ports/order-shortage.port';
import {
  OPEN_ORDER_BATCH,
  OPEN_ORDER_DEFAULT_LIMIT,
  PRODUCTION_MANAGER_ROLE,
  PRODUCTION_ORDER_LABEL,
} from '@plugins/production/production-order/constants/production-order.constant';
import { ProductionOrderFilterDto } from '@plugins/production/production-order/dto/production-order-filter.dto';
import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';
import {
  productionOrderScope,
  unitScope,
} from '@plugins/production/production-order/utils/production-scope.util';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { OpenOrderQueryDto } from '@plugins/production/production-order/dto/production-order-filter.dto';
import type { ProductionOrderEventType } from '@plugins/production/production-order/enums/production-order-event.enum';
import type { ProductionStage } from '@plugins/production/production-order/enums/production-stage.enum';

export interface ProductionOrderRow {
  id: number;
  code: string;
  orderId: number;
  orderCode: string;
  status: ProductionOrderStatus;
  customerName: string | null;
  deliveryDate: string | null;
  /** Cabinets the actor sees: all of them, or only the technician's own. */
  unitCount: number;
  createdAt: Date;
  releasedAt: Date | null;
}

export interface ProductionUnitView {
  id: number;
  code: string;
  tag: string;
  description: string | null;
  orderLineId: number;
  assigneeId: number | null;
  assigneeName: string | null;
  plannedEndDate: string | null;
  /** Stages done, 0 to 6. */
  doneCount: number;
  /** First stage not done; null when the cabinet is finished. */
  currentStage: ProductionStage | null;
}

export interface ProductionOrderEventView {
  id: number;
  event: ProductionOrderEventType;
  actorId: number;
  actorName: string | null;
  unitCode: string | null;
  /** Stage and severity codes of an issue event; null for every other event. */
  stage: string | null;
  severity: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface ProductionOrderDetail extends ProductionOrderRow {
  cancelReason: string | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  units: ProductionUnitView[];
  /** Present for a production manager or an admin only; absent for every other reader. */
  events?: ProductionOrderEventView[];
}

export interface OpenOrderOption {
  id: number;
  code: string;
  customerName: string;
  deliveryDate: string | null;
}

/** The roles that read a production order's history. */
const HISTORY_ROLES: readonly string[] = [PRODUCTION_MANAGER_ROLE, 'admin'];

type RawRow = Record<string, unknown>;

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const dateOrNull = (value: unknown): Date | null =>
  value instanceof Date ? value : null;
/** A `date` column arrives as text (`YYYY-MM-DD`) or as a date at local midnight. */
const dateOnly = (value: unknown): string | null => {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return null;
};

/**
 * Production orders as the actor's data scope lets them be read. The scope is part of
 * the SQL, so a page never holds an order the detail would refuse; an order outside it answers
 * 404 like a missing one. No response carries a price: the sales order is read through ports
 * that expose none.
 */
@Injectable()
export class ProductionOrderQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly production: OrderProductionPort,
    private readonly orders: OrderMaterialReadPort,
    private readonly shortage: OrderShortagePort,
  ) {}

  async findAll(query: ProductionOrderFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const scope = this.dataScope.scopeOf(actor);
    const params: unknown[] = [];
    const conditions = ['po.is_deleted = false'];
    const bind = (sql: (placeholder: string) => string, value: unknown) => {
      params.push(value);
      conditions.push(sql(`$${params.length}`));
    };
    const reach = productionOrderScope(
      scope,
      actor,
      this.production,
      params.length + 1,
    );
    params.push(...reach.params);
    conditions.push(reach.sql);
    if (query.status) bind((p) => `po.status = ${p}`, query.status);
    if (query.orderId !== undefined) {
      bind((p) => `po.order_id = ${p}`, query.orderId);
    }
    const mine = unitScope(scope, actor, params.length + 1);
    params.push(...mine.params);
    params.push(take, skip);

    const rows: RawRow[] = await this.dataSource.query(
      `SELECT po.id, po.code, po.order_id, po.order_code, po.status, po.created_at,
              po.released_at,
              (SELECT COUNT(*) FROM production_units unit
                WHERE unit.production_order_id = po.id AND unit.is_deleted = false
                  AND ${mine.sql}) AS unit_count,
              COUNT(*) OVER () AS total_rows
         FROM production_orders po
        WHERE ${conditions.join(' AND ')}
        ORDER BY po.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const headers = await this.orders.getOrders(
      this.dataSource.manager,
      rows.map((row) => Number(row.order_id)),
    );
    const data = rows.map((row) => this.toRow(row, headers));
    return paginate(
      data,
      rows.length > 0 ? Number(rows[0].total_rows) : 0,
      page,
      limit,
    );
  }

  async findOne(
    id: number,
    actor: AuthUserPayload,
  ): Promise<ProductionOrderDetail> {
    const scope = this.dataScope.scopeOf(actor);
    const reach = productionOrderScope(scope, actor, this.production, 2);
    const [head]: RawRow[] = await this.dataSource.query(
      `SELECT po.*
         FROM production_orders po
        WHERE po.id = $1 AND po.is_deleted = false AND ${reach.sql}`,
      [id, ...reach.params],
    );
    if (!head) {
      throw new NotFoundException(`${PRODUCTION_ORDER_LABEL} not found`);
    }

    const mine = unitScope(scope, actor, 2);
    const units: RawRow[] = await this.dataSource.query(
      `SELECT unit.id, unit.code, unit.tag, unit.description, unit.order_line_id,
              unit.assignee_id, assignee.full_name AS assignee_name, unit.planned_end_date,
              (SELECT COUNT(*) FROM production_unit_stages s
                WHERE s.unit_id = unit.id AND s.status = 'done') AS done_count,
              (SELECT s.stage FROM production_unit_stages s
                WHERE s.unit_id = unit.id AND s.status <> 'done'
                ORDER BY s.seq LIMIT 1) AS current_stage
         FROM production_units unit
         LEFT JOIN users assignee ON assignee.id = unit.assignee_id
        WHERE unit.production_order_id = $1 AND unit.is_deleted = false AND ${mine.sql}
        ORDER BY unit.id`,
      [id, ...mine.params],
    );
    const events: RawRow[] | null =
      actor.role !== undefined && HISTORY_ROLES.includes(actor.role)
        ? await this.dataSource.query(
            `SELECT e.id, e.event, e.actor_id, actor.full_name AS actor_name, e.unit_code,
                    e.stage, e.severity, e.reason, e.created_at
               FROM production_order_events e
               LEFT JOIN users actor ON actor.id = e.actor_id
              WHERE e.production_order_id = $1
              ORDER BY e.id`,
            [id],
          )
        : null;
    const headers = await this.orders.getOrders(this.dataSource.manager, [
      Number(head.order_id),
    ]);
    return {
      ...this.toRow({ ...head, unit_count: units.length }, headers),
      cancelReason: textOrNull(head.cancel_reason),
      cancelledAt: dateOrNull(head.cancelled_at),
      completedAt: dateOrNull(head.completed_at),
      units: units.map((unit) => ({
        id: Number(unit.id),
        code: String(unit.code),
        tag: String(unit.tag),
        description: textOrNull(unit.description),
        orderLineId: Number(unit.order_line_id),
        assigneeId: unit.assignee_id === null ? null : Number(unit.assignee_id),
        assigneeName: textOrNull(unit.assignee_name),
        plannedEndDate: dateOnly(unit.planned_end_date),
        doneCount: Number(unit.done_count),
        currentStage: (unit.current_stage as ProductionStage | null) ?? null,
      })),
      ...(events && {
        events: events.map((event) => ({
          id: Number(event.id),
          event: event.event as ProductionOrderEventType,
          actorId: Number(event.actor_id),
          actorName: textOrNull(event.actor_name),
          unitCode: textOrNull(event.unit_code),
          stage: textOrNull(event.stage),
          severity: textOrNull(event.severity),
          reason: textOrNull(event.reason),
          createdAt: event.created_at as Date,
        })),
      }),
    };
  }

  /**
   * The items the sales order of a production order is still short of, as the material view
   * computes them. Reaches the same production orders as the detail; anything else answers 404.
   */
  async findShortage(
    id: number,
    actor: AuthUserPayload,
  ): Promise<OrderShortItem[]> {
    const reach = productionOrderScope(
      this.dataScope.scopeOf(actor),
      actor,
      this.production,
      2,
    );
    const [head]: Array<{ order_id: number }> = await this.dataSource.query(
      `SELECT po.order_id
         FROM production_orders po
        WHERE po.id = $1 AND po.is_deleted = false AND ${reach.sql}`,
      [id, ...reach.params],
    );
    if (!head) {
      throw new NotFoundException(`${PRODUCTION_ORDER_LABEL} not found`);
    }
    return this.shortage.shortByOrder(Number(head.order_id));
  }

  /**
   * Open orders still without a live production order, for the create picker: the order list
   * is walked a batch at a time until enough orders qualify, so the picker is never short of
   * an order that sits behind busy ones.
   */
  async findOpenOrders(
    query: OpenOrderQueryDto,
    actor: AuthUserPayload,
  ): Promise<OpenOrderOption[]> {
    const wanted = query.limit ?? OPEN_ORDER_DEFAULT_LIMIT;
    const manager = this.dataSource.manager;
    const scope = this.dataScope.scopeOf(actor);
    const found: OpenOrderOption[] = [];

    for (let skip = 0; found.length < wanted; skip += OPEN_ORDER_BATCH) {
      const { rows, count } = await this.orders.listOrders(
        manager,
        {
          status: 'open',
          search: query.search,
          skip,
          take: OPEN_ORDER_BATCH,
        },
        materialListCondition(scope, actor.userId),
      );
      const taken: Array<{ order_id: number }> = rows.length
        ? await manager.query(
            `SELECT order_id FROM production_orders
              WHERE order_id = ANY($1::int[]) AND status <> 'cancelled' AND is_deleted = false`,
            [rows.map((row) => row.id)],
          )
        : [];
      const busy = new Set(taken.map((row) => Number(row.order_id)));
      for (const row of rows) {
        if (busy.has(row.id) || found.length >= wanted) continue;
        found.push({
          id: row.id,
          code: row.code,
          customerName: row.customerName,
          deliveryDate: row.deliveryDate,
        });
      }
      if (skip + OPEN_ORDER_BATCH >= count) break;
    }
    return found;
  }

  private toRow(
    row: RawRow,
    headers: Awaited<ReturnType<OrderMaterialReadPort['getOrders']>>,
  ): ProductionOrderRow {
    const header = headers.get(Number(row.order_id));
    return {
      id: Number(row.id),
      code: String(row.code),
      orderId: Number(row.order_id),
      orderCode: String(row.order_code),
      status: row.status as ProductionOrderStatus,
      customerName: header?.customerName ?? null,
      deliveryDate: header?.deliveryDate ?? null,
      unitCount: Number(row.unit_count),
      createdAt: row.created_at as Date,
      releasedAt: dateOrNull(row.released_at),
    };
  }
}
