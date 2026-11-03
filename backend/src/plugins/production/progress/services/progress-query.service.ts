import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { DataScopeService } from '@shared/services/data-scope.service';
import { resolvePagination } from '@shared/utils/pagination.util';

import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';
import {
  ProductionStage,
  ProductionStageStatus,
} from '@plugins/production/production-order/enums/production-stage.enum';
import {
  productionOrderScope,
  unitScope,
} from '@plugins/production/production-order/utils/production-scope.util';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { ProductionUnitFilterDto } from '@plugins/production/progress/dto/progress.dto';

export interface StageView {
  stage: ProductionStage;
  seq: number;
  status: ProductionStageStatus;
  startedAt: Date | null;
  startedByName: string | null;
  doneAt: Date | null;
  doneByName: string | null;
}

export interface ProgressUnitView {
  id: number;
  code: string;
  tag: string;
  description: string | null;
  productionOrderId: number;
  productionOrderCode: string;
  productionOrderStatus: ProductionOrderStatus;
  assigneeId: number | null;
  assigneeName: string | null;
  plannedEndDate: string | null;
  stages: StageView[];
  /** Stages done, 0 to 6. */
  doneCount: number;
  /** First stage not done; null when the cabinet is finished. */
  currentStage: ProductionStage | null;
}

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

const UNIT_COLUMNS = `unit.id, unit.code, unit.tag, unit.description, unit.assignee_id,
       assignee.full_name AS assignee_name, unit.planned_end_date,
       po.id AS production_order_id, po.code AS production_order_code,
       po.status AS production_order_status`;
const UNIT_FROM = `FROM production_units unit
       JOIN production_orders po ON po.id = unit.production_order_id
       LEFT JOIN users assignee ON assignee.id = unit.assignee_id`;

/**
 * Cabinets with their six stages as the actor's data scope lets them be read. The production
 * order scope and the cabinet scope are part of the SQL, so a page never holds a cabinet the
 * detail would refuse, and one outside the scope answers 404 like a missing one.
 */
@Injectable()
export class ProgressQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly production: OrderProductionPort,
  ) {}

  async findAll(query: ProductionUnitFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const scope = this.dataScope.scopeOf(actor);
    const params: unknown[] = [];
    const conditions = ['unit.is_deleted = false', 'po.is_deleted = false'];
    const reach = productionOrderScope(scope, actor, this.production, 1);
    params.push(...reach.params);
    conditions.push(reach.sql);
    const mine = unitScope(scope, actor, params.length + 1);
    params.push(...mine.params);
    conditions.push(mine.sql);
    if (query.mine) {
      params.push(actor.userId);
      conditions.push(`unit.assignee_id = $${params.length}`);
    }
    if (query.productionOrderId !== undefined) {
      params.push(query.productionOrderId);
      conditions.push(`unit.production_order_id = $${params.length}`);
    }
    if (query.stageStatus === ProductionStageStatus.DONE) {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM production_unit_stages s
                      WHERE s.unit_id = unit.id AND s.status <> 'done')`,
      );
    } else if (query.stageStatus) {
      params.push(query.stageStatus);
      conditions.push(
        `EXISTS (SELECT 1 FROM production_unit_stages s
                  WHERE s.unit_id = unit.id AND s.status = $${params.length}
                    AND NOT EXISTS (SELECT 1 FROM production_unit_stages earlier
                                     WHERE earlier.unit_id = unit.id AND earlier.seq < s.seq
                                       AND earlier.status <> 'done'))`,
      );
    }
    params.push(take, skip);

    const rows: RawRow[] = await this.dataSource.query(
      `SELECT ${UNIT_COLUMNS}, COUNT(*) OVER () AS total_rows
         ${UNIT_FROM}
        WHERE ${conditions.join(' AND ')}
        ORDER BY unit.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return paginate(
      await this.withStages(rows),
      rows.length > 0 ? Number(rows[0].total_rows) : 0,
      page,
      limit,
    );
  }

  async findOne(id: number, actor: AuthUserPayload): Promise<ProgressUnitView> {
    const scope = this.dataScope.scopeOf(actor);
    const reach = productionOrderScope(scope, actor, this.production, 2);
    const mine = unitScope(scope, actor, 2 + reach.params.length);
    const rows: RawRow[] = await this.dataSource.query(
      `SELECT ${UNIT_COLUMNS}
         ${UNIT_FROM}
        WHERE unit.id = $1 AND unit.is_deleted = false AND po.is_deleted = false
          AND ${reach.sql} AND ${mine.sql}`,
      [id, ...reach.params, ...mine.params],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Production cabinet not found');
    }
    return (await this.withStages(rows))[0];
  }

  private async withStages(units: RawRow[]): Promise<ProgressUnitView[]> {
    if (units.length === 0) return [];
    const stages: RawRow[] = await this.dataSource.query(
      `SELECT s.unit_id, s.stage, s.seq, s.status, s.started_at, s.done_at,
              starter.full_name AS started_by_name, finisher.full_name AS done_by_name
         FROM production_unit_stages s
         LEFT JOIN users starter ON starter.id = s.started_by
         LEFT JOIN users finisher ON finisher.id = s.done_by
        WHERE s.unit_id = ANY($1::int[])
        ORDER BY s.unit_id, s.seq`,
      [units.map((unit) => Number(unit.id))],
    );
    const byUnit = new Map<number, StageView[]>();
    for (const row of stages) {
      const list = byUnit.get(Number(row.unit_id)) ?? [];
      list.push({
        stage: row.stage as ProductionStage,
        seq: Number(row.seq),
        status: row.status as ProductionStageStatus,
        startedAt: dateOrNull(row.started_at),
        startedByName: textOrNull(row.started_by_name),
        doneAt: dateOrNull(row.done_at),
        doneByName: textOrNull(row.done_by_name),
      });
      byUnit.set(Number(row.unit_id), list);
    }
    return units.map((unit) => {
      const unitStages = byUnit.get(Number(unit.id)) ?? [];
      const current = unitStages.find(
        (stage) => stage.status !== ProductionStageStatus.DONE,
      );
      return {
        id: Number(unit.id),
        code: String(unit.code),
        tag: String(unit.tag),
        description: textOrNull(unit.description),
        productionOrderId: Number(unit.production_order_id),
        productionOrderCode: String(unit.production_order_code),
        productionOrderStatus:
          unit.production_order_status as ProductionOrderStatus,
        assigneeId: unit.assignee_id === null ? null : Number(unit.assignee_id),
        assigneeName: textOrNull(unit.assignee_name),
        plannedEndDate: dateOnly(unit.planned_end_date),
        stages: unitStages,
        doneCount: unitStages.filter(
          (stage) => stage.status === ProductionStageStatus.DONE,
        ).length,
        currentStage: current?.stage ?? null,
      };
    });
  }
}
