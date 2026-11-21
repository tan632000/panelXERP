import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { DataScopeService } from '@shared/services/data-scope.service';
import { resolvePagination } from '@shared/utils/pagination.util';

import {
  assertUnitVisible,
  deliveryOrderScope,
} from '@plugins/delivery/_shared/utils/delivery-scope.util';
import {
  QC_READY_PRODUCTION_STATUSES,
  QC_ROUND_FAILED,
  QC_ROUND_PASSED,
  QcItemResult,
  QcUnitStatus,
} from '@plugins/delivery/qc-inspection/constants/qc-inspection.constant';
import {
  CreateQcRoundDto,
  QcUnitFilterDto,
} from '@plugins/delivery/qc-inspection/dto/qc-inspection.dto';
import {
  QcNotifier,
  type RecordedRound,
} from '@plugins/delivery/qc-inspection/services/qc-notifier.service';
import {
  DEFECT_SELECT,
  PHOTO_SELECT,
  toDefectView,
  toPhotoView,
  type QcDefectView,
  type QcPhotoView,
  type RawRow,
} from '@plugins/delivery/qc-inspection/services/qc-views';
import {
  ProductionUnitPort,
  type ProductionUnitView,
} from '@plugins/production/_shared/ports/production-unit.port';
import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

export interface QcUnitSummary {
  unitId: number;
  code: string;
  tag: string;
  description: string | null;
  productionOrderId: number;
  productionOrderCode: string;
  orderId: number;
  orderCode: string | null;
  customerName: string | null;
  qcStatus: QcUnitStatus;
}

export interface QcRoundItemView {
  id: number;
  checklistItemId: number;
  name: string;
  position: number;
  result: QcItemResult;
  note: string | null;
  photos: QcPhotoView[];
}

export interface QcRoundView {
  id: number;
  roundNo: number;
  result: string;
  inspectedAt: Date;
  inspectorId: number;
  inspectorName: string | null;
  items: QcRoundItemView[];
}

export interface QcUnitDetail extends QcUnitSummary {
  rounds: QcRoundView[];
  defects: QcDefectView[];
}

interface RoundSummary {
  total: number;
  passed: boolean;
}

/** `not_ready` until finishing is done on a live production order, then by what QC found. */
export function qcStatusOf(
  unit: Pick<ProductionUnitView, 'finishingDone' | 'productionOrderStatus'>,
  rounds: RoundSummary | undefined,
): QcUnitStatus {
  if (rounds?.passed) return QcUnitStatus.PASSED;
  if (rounds && rounds.total > 0) return QcUnitStatus.FAILED;
  return unit.finishingDone &&
    QC_READY_PRODUCTION_STATUSES.includes(unit.productionOrderStatus)
    ? QcUnitStatus.WAITING
    : QcUnitStatus.NOT_READY;
}

/**
 * QC rounds on finished cabinets. Every write takes the cabinet through the production port
 * first (production order header `FOR UPDATE`, then the cabinet row), then checks the scope and
 * the rules on the locked state, so a round queued behind a finishing undo, a cancel or another
 * round sees what that one committed. The checklist template takes no lock: a round copies the
 * active items it reads in its own transaction.
 */
@Injectable()
export class QcInspectionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly units: ProductionUnitPort,
    private readonly production: OrderProductionPort,
    private readonly headers: OrderMaterialReadPort,
    private readonly notifier: QcNotifier,
  ) {}

  async listUnits(query: QcUnitFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const manager = this.dataSource.manager;
    const reached = (
      await this.units.listUnits(manager, {
        orderScope: this.orderScope(actor),
        orderId: query.orderId,
      })
    ).filter(
      (unit) => unit.productionOrderStatus !== ProductionOrderStatus.CANCELLED,
    );
    const rounds = await this.roundSummaries(
      manager,
      reached.map((unit) => unit.unitId),
    );
    const matching = reached
      .map((unit) => ({
        unit,
        qcStatus: qcStatusOf(unit, rounds.get(unit.unitId)),
      }))
      .filter((row) => !query.qcStatus || row.qcStatus === query.qcStatus);
    const pageRows = matching.slice(skip, skip + limit);
    const orders = await this.headers.getOrders(
      manager,
      pageRows.map((row) => row.unit.orderId),
    );
    return paginate(
      pageRows.map(({ unit, qcStatus }) =>
        this.summary(unit, qcStatus, orders.get(unit.orderId)),
      ),
      matching.length,
      page,
      limit,
    );
  }

  async getUnit(unitId: number, actor: AuthUserPayload): Promise<QcUnitDetail> {
    const manager = this.dataSource.manager;
    const [unit] = await this.units.listUnits(manager, {
      orderScope: this.orderScope(actor),
      unitId,
    });
    if (!unit) throw new NotFoundException('Production cabinet not found');
    const rounds = await this.roundSummaries(manager, [unitId]);
    const header = await this.headers.getOrder(manager, unit.orderId);
    return {
      ...this.summary(
        unit,
        qcStatusOf(unit, rounds.get(unitId)),
        header ?? undefined,
      ),
      rounds: await this.roundViews(manager, unitId),
      defects: await this.defectViews(manager, unitId),
    };
  }

  /** Records a round in its own transaction, tells the next people after the commit. */
  async createRound(
    unitId: number,
    dto: CreateQcRoundDto,
    actor: AuthUserPayload,
  ): Promise<QcUnitDetail> {
    const recorded = await this.dataSource.transaction((manager) =>
      this.recordRound(manager, unitId, dto, actor),
    );
    await this.notifier.roundRecorded(recorded, actor.userId);
    return this.getUnit(unitId, actor);
  }

  /** The write itself, on the caller's transaction: lock, scope, rules, rows. */
  async recordRound(
    manager: EntityManager,
    unitId: number,
    dto: CreateQcRoundDto,
    actor: AuthUserPayload,
  ): Promise<RecordedRound> {
    if (
      dto.results.some((r) => r.result === QcItemResult.FAIL && !r.note?.trim())
    ) {
      throw new BadRequestException('A failed item needs a note.');
    }
    const unit = await this.units.lockUnit(manager, unitId);
    await assertUnitVisible(
      manager,
      this.units,
      this.orderScope(actor),
      unitId,
    );
    if (
      !unit.finishingDone ||
      !QC_READY_PRODUCTION_STATUSES.includes(unit.productionOrderStatus)
    ) {
      throw new ConflictException(
        `Cabinet ${unit.code} is not_ready for QC: its finishing stage must be done on a released or completed production order.`,
      );
    }
    const [state]: RawRow[] = await manager.query(
      `SELECT COUNT(*) AS total,
              COALESCE(BOOL_OR(result = $2), false) AS passed,
              (SELECT COUNT(*) FROM qc_defects
                WHERE unit_id = $1 AND is_deleted = false AND status <> 'verified') AS open
         FROM qc_rounds WHERE unit_id = $1 AND is_deleted = false`,
      [unitId, QC_ROUND_PASSED],
    );
    if (state.passed) {
      throw new ConflictException(`Cabinet ${unit.code} already passed QC.`);
    }
    if (Number(state.open) > 0) {
      throw new ConflictException(
        `Cabinet ${unit.code} has a defect that is not verified yet.`,
      );
    }

    const active: RawRow[] = await manager.query(
      `SELECT id, name, position FROM qc_checklist_items
        WHERE is_deleted = false AND active = true ORDER BY position, id`,
    );
    if (active.length === 0) {
      throw new ConflictException('The QC checklist has no active item.');
    }
    const given = new Map(dto.results.map((r) => [r.checklistItemId, r]));
    if (
      given.size !== dto.results.length ||
      given.size !== active.length ||
      active.some((item) => !given.has(Number(item.id)))
    ) {
      throw new ConflictException(
        'The checklist changed: send one result for every active item.',
      );
    }

    const failed = dto.results.some((r) => r.result === QcItemResult.FAIL);
    const [round]: RawRow[] = await manager.query(
      `INSERT INTO qc_rounds (unit_id, round_no, inspector_id, result, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $3, $3) RETURNING id, round_no`,
      [
        unitId,
        Number(state.total) + 1,
        actor.userId,
        failed ? QC_ROUND_FAILED : QC_ROUND_PASSED,
      ],
    );
    // Every active item has a result: the set comparison above proved it.
    const picked = active.flatMap((item) => {
      const result = given.get(Number(item.id));
      return result ? [{ item, result }] : [];
    });
    await manager.query(
      `INSERT INTO qc_round_items
         (round_id, checklist_item_id, name, position, result, note, created_by, updated_by)
       SELECT $1, t.item_id, t.name, t.position, t.result, t.note, $2, $2
         FROM unnest($3::int[], $4::text[], $5::int[], $6::text[], $7::text[])
              AS t(item_id, name, position, result, note)`,
      [
        round.id,
        actor.userId,
        picked.map(({ item }) => Number(item.id)),
        picked.map(({ item }) => String(item.name)),
        picked.map(({ item }) => Number(item.position)),
        picked.map(({ result }) => result.result),
        picked.map(({ result }) => result.note?.trim() || null),
      ],
    );
    const defects: unknown[] = await manager.query(
      `INSERT INTO qc_defects (unit_id, round_item_id, description, created_by, updated_by)
       SELECT $1, it.id, it.note, $2, $2
         FROM qc_round_items it WHERE it.round_id = $3 AND it.result = $4
       RETURNING id`,
      [unitId, actor.userId, round.id, QcItemResult.FAIL],
    );
    return {
      roundNo: Number(round.round_no),
      result: failed ? QC_ROUND_FAILED : QC_ROUND_PASSED,
      defectCount: defects.length,
      unit,
    };
  }

  private orderScope(actor: AuthUserPayload) {
    return deliveryOrderScope(
      this.dataScope.scopeOf(actor),
      actor,
      this.production,
    );
  }

  private summary(
    unit: ProductionUnitView,
    qcStatus: QcUnitStatus,
    order: { code: string; customerName: string } | undefined,
  ): QcUnitSummary {
    return {
      unitId: unit.unitId,
      code: unit.code,
      tag: unit.tag,
      description: unit.description,
      productionOrderId: unit.productionOrderId,
      productionOrderCode: unit.productionOrderCode,
      orderId: unit.orderId,
      orderCode: order?.code ?? null,
      customerName: order?.customerName ?? null,
      qcStatus,
    };
  }

  private async roundSummaries(
    manager: EntityManager,
    unitIds: readonly number[],
  ): Promise<Map<number, RoundSummary>> {
    if (unitIds.length === 0) return new Map();
    const rows: RawRow[] = await manager.query(
      `SELECT unit_id, COUNT(*) AS total, BOOL_OR(result = $2) AS passed
         FROM qc_rounds
        WHERE unit_id = ANY($1::int[]) AND is_deleted = false
        GROUP BY unit_id`,
      [[...unitIds], QC_ROUND_PASSED],
    );
    return new Map(
      rows.map((row) => [
        Number(row.unit_id),
        { total: Number(row.total), passed: Boolean(row.passed) },
      ]),
    );
  }

  private async roundViews(
    manager: EntityManager,
    unitId: number,
  ): Promise<QcRoundView[]> {
    const rounds: RawRow[] = await manager.query(
      `SELECT r.id, r.round_no, r.result, r.inspected_at, r.inspector_id,
              inspector.full_name AS inspector_name
         FROM qc_rounds r LEFT JOIN users inspector ON inspector.id = r.inspector_id
        WHERE r.unit_id = $1 AND r.is_deleted = false ORDER BY r.round_no`,
      [unitId],
    );
    const items: RawRow[] = await manager.query(
      `SELECT it.id, it.round_id, it.checklist_item_id, it.name, it.position, it.result, it.note
         FROM qc_round_items it JOIN qc_rounds r ON r.id = it.round_id
        WHERE r.unit_id = $1 AND r.is_deleted = false AND it.is_deleted = false
        ORDER BY it.round_id, it.position, it.id`,
      [unitId],
    );
    const photos: RawRow[] = await manager.query(
      `${PHOTO_SELECT}
         JOIN qc_round_items it ON it.id = p.round_item_id
         JOIN qc_rounds r ON r.id = it.round_id
        WHERE r.unit_id = $1 AND r.is_deleted = false AND p.is_deleted = false
        ORDER BY p.id`,
      [unitId],
    );
    return rounds.map((round) => ({
      id: Number(round.id),
      roundNo: Number(round.round_no),
      result: String(round.result),
      inspectedAt: round.inspected_at as Date,
      inspectorId: Number(round.inspector_id),
      inspectorName:
        typeof round.inspector_name === 'string' ? round.inspector_name : null,
      items: items
        .filter((item) => Number(item.round_id) === Number(round.id))
        .map((item) => ({
          id: Number(item.id),
          checklistItemId: Number(item.checklist_item_id),
          name: String(item.name),
          position: Number(item.position),
          result: item.result as QcItemResult,
          note: typeof item.note === 'string' ? item.note : null,
          photos: photos
            .filter((photo) => Number(photo.round_item_id) === Number(item.id))
            .map(toPhotoView),
        })),
    }));
  }

  private async defectViews(
    manager: EntityManager,
    unitId: number,
  ): Promise<QcDefectView[]> {
    const rows: RawRow[] = await manager.query(
      `${DEFECT_SELECT} WHERE d.unit_id = $1 AND d.is_deleted = false ORDER BY d.id`,
      [unitId],
    );
    return rows.map(toDefectView);
  }
}
