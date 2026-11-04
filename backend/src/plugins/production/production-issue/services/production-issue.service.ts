import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { DataScopeService } from '@shared/services/data-scope.service';
import { resolvePagination } from '@shared/utils/pagination.util';

import { ProductionIssue } from '@plugins/production/production-issue/entities/production-issue.entity';
import {
  ProductionIssueSeverity,
  ProductionIssueStatus,
} from '@plugins/production/production-issue/enums/production-issue.enum';
import { ProductionOrderEventType } from '@plugins/production/production-order/enums/production-order-event.enum';
import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';
import { ProductionOrderNotifier } from '@plugins/production/production-order/services/production-order-notifier.service';
import {
  lockUnitForWork,
  recordProductionEvent,
} from '@plugins/production/production-order/utils/production-order-lock.util';
import {
  mayWorkUnit,
  productionOrderScope,
  unitScope,
} from '@plugins/production/production-order/utils/production-scope.util';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type {
  CreateProductionIssueDto,
  ProductionIssueFilterDto,
} from '@plugins/production/production-issue/dto/production-issue.dto';
import type { ProductionStage } from '@plugins/production/production-order/enums/production-stage.enum';

export interface ProductionIssueView {
  id: number;
  unitId: number;
  unitCode: string;
  productionOrderId: number;
  productionOrderCode: string;
  stage: ProductionStage;
  description: string;
  severity: ProductionIssueSeverity;
  status: ProductionIssueStatus;
  reportedBy: number;
  reportedByName: string | null;
  createdAt: Date;
  resolvedBy: number | null;
  resolvedByName: string | null;
  resolvedAt: Date | null;
  resolution: string | null;
}

type RawRow = Record<string, unknown>;

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const idOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const ISSUE_SELECT = `SELECT issue.id, issue.unit_id, unit.code AS unit_code, issue.stage,
       issue.description, issue.severity, issue.status, issue.reported_by,
       reporter.full_name AS reported_by_name, issue.created_at, issue.resolved_by,
       resolver.full_name AS resolved_by_name, issue.resolved_at, issue.resolution,
       po.id AS production_order_id, po.code AS production_order_code`;
const ISSUE_FROM = `FROM production_issues issue
       JOIN production_units unit ON unit.id = issue.unit_id
       JOIN production_orders po ON po.id = unit.production_order_id
       LEFT JOIN users reporter ON reporter.id = issue.reported_by
       LEFT JOIN users resolver ON resolver.id = issue.resolved_by`;
const NOT_DELETED =
  'issue.is_deleted = false AND unit.is_deleted = false AND po.is_deleted = false';

function toView(row: RawRow): ProductionIssueView {
  return {
    id: Number(row.id),
    unitId: Number(row.unit_id),
    unitCode: String(row.unit_code),
    productionOrderId: Number(row.production_order_id),
    productionOrderCode: String(row.production_order_code),
    stage: row.stage as ProductionStage,
    description: String(row.description),
    severity: row.severity as ProductionIssueSeverity,
    status: row.status as ProductionIssueStatus,
    reportedBy: Number(row.reported_by),
    reportedByName: textOrNull(row.reported_by_name),
    createdAt: row.created_at as Date,
    resolvedBy: idOrNull(row.resolved_by),
    resolvedByName: textOrNull(row.resolved_by_name),
    resolvedAt: (row.resolved_at as Date | null) ?? null,
    resolution: textOrNull(row.resolution),
  };
}

const WORKING = [ProductionOrderStatus.RELEASED];
const ANY_STATUS = Object.values(ProductionOrderStatus);

/**
 * Problems reported on a cabinet. Reads follow the same production order and cabinet scope as
 * the cabinet itself, in SQL. Opening and resolving take the production order locks and re-check
 * on the locked rows; an issue never blocks a stage. The notices go out after the commit.
 */
@Injectable()
export class ProductionIssueService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly production: OrderProductionPort,
    private readonly notifier: ProductionOrderNotifier,
  ) {}

  async findAll(query: ProductionIssueFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const scope = this.dataScope.scopeOf(actor);
    const params: unknown[] = [];
    const conditions = [NOT_DELETED];
    const reach = productionOrderScope(scope, actor, this.production, 1);
    params.push(...reach.params);
    conditions.push(reach.sql);
    const mine = unitScope(scope, actor, params.length + 1);
    params.push(...mine.params);
    conditions.push(mine.sql);
    if (query.status) {
      params.push(query.status);
      conditions.push(`issue.status = $${params.length}`);
    }
    if (query.productionOrderId !== undefined) {
      params.push(query.productionOrderId);
      conditions.push(`po.id = $${params.length}`);
    }
    if (query.unitId !== undefined) {
      params.push(query.unitId);
      conditions.push(`issue.unit_id = $${params.length}`);
    }
    params.push(take, skip);

    const rows: RawRow[] = await this.dataSource.query(
      `${ISSUE_SELECT}, COUNT(*) OVER () AS total_rows
         ${ISSUE_FROM}
        WHERE ${conditions.join(' AND ')}
        ORDER BY issue.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return paginate(
      rows.map(toView),
      rows.length > 0 ? Number(rows[0].total_rows) : 0,
      page,
      limit,
    );
  }

  async findOne(
    id: number,
    actor: AuthUserPayload,
  ): Promise<ProductionIssueView> {
    const scope = this.dataScope.scopeOf(actor);
    const reach = productionOrderScope(scope, actor, this.production, 2);
    const mine = unitScope(scope, actor, 2 + reach.params.length);
    const rows: RawRow[] = await this.dataSource.query(
      `${ISSUE_SELECT}
         ${ISSUE_FROM}
        WHERE issue.id = $1 AND ${NOT_DELETED} AND ${reach.sql} AND ${mine.sql}`,
      [id, ...reach.params, ...mine.params],
    );
    if (rows.length === 0) throw new NotFoundException('Issue not found');
    return toView(rows[0]);
  }

  async open(
    unitId: number,
    dto: CreateProductionIssueDto,
    actor: AuthUserPayload,
  ): Promise<ProductionIssueView> {
    const scope = this.dataScope.scopeOf(actor);
    const { order, unit, issue } = await this.dataSource.transaction(
      async (manager) => {
        const locked = await lockUnitForWork(
          manager,
          unitId,
          (candidate) => mayWorkUnit(scope, candidate, actor),
          WORKING,
          'reported against',
        );
        const repo = manager.getRepository(ProductionIssue);
        const created = await repo.save(
          repo.create({
            unitId,
            stage: dto.stage,
            description: dto.description,
            severity: dto.severity,
            reportedBy: actor.userId,
            createdBy: actor.userId,
          }),
        );
        await recordProductionEvent(
          manager,
          locked.order.id,
          ProductionOrderEventType.ISSUE_REPORTED,
          actor.userId,
          {
            unitCode: locked.unit.code,
            stage: dto.stage,
            severity: dto.severity,
            reason: dto.description,
          },
        );
        return { ...locked, issue: created };
      },
    );

    await this.notifier.issueOpened(
      order,
      {
        id: issue.id,
        unitId,
        unitCode: unit.code,
        stage: issue.stage,
        severity: issue.severity,
      },
      actor.userId,
    );
    return this.findOne(issue.id, actor);
  }

  async resolve(
    id: number,
    resolution: string,
    actor: AuthUserPayload,
  ): Promise<ProductionIssueView> {
    const scope = this.dataScope.scopeOf(actor);
    // The cabinet of an issue never changes, so it is read before any lock is taken.
    const head = await this.dataSource.getRepository(ProductionIssue).findOne({
      where: { id, isDeleted: false },
      select: { id: true, unitId: true },
    });
    if (!head) throw new NotFoundException('Issue not found');

    const { order, unit, issue } = await this.dataSource.transaction(
      async (manager) => {
        const locked = await lockUnitForWork(
          manager,
          head.unitId,
          (candidate) => mayWorkUnit(scope, candidate, actor),
          ANY_STATUS,
          'resolved',
        );
        const repo = manager.getRepository(ProductionIssue);
        const current = await repo.findOne({ where: { id, isDeleted: false } });
        if (!current) throw new NotFoundException('Issue not found');
        if (current.status !== ProductionIssueStatus.OPEN) {
          throw new ConflictException('This issue is already resolved.');
        }
        const result = await repo.update(
          { id, status: ProductionIssueStatus.OPEN },
          {
            status: ProductionIssueStatus.RESOLVED,
            resolution,
            resolvedBy: actor.userId,
            resolvedAt: new Date(),
            updatedBy: actor.userId,
          },
        );
        if (result.affected !== 1) {
          throw new ConflictException('This issue is already resolved.');
        }
        await recordProductionEvent(
          manager,
          locked.order.id,
          ProductionOrderEventType.ISSUE_RESOLVED,
          actor.userId,
          {
            unitCode: locked.unit.code,
            stage: current.stage,
            severity: current.severity,
            reason: resolution,
          },
        );
        return { ...locked, issue: current };
      },
    );

    await this.notifier.issueResolved(
      order,
      {
        id,
        unitId: unit.id,
        unitCode: unit.code,
        stage: issue.stage,
        severity: issue.severity,
      },
      issue.reportedBy,
      actor.userId,
    );
    return this.findOne(id, actor);
  }
}
