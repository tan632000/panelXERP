import {
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
import { QcDefectStatus } from '@plugins/delivery/qc-inspection/constants/qc-inspection.constant';
import {
  FixQcDefectDto,
  QcDefectFilterDto,
} from '@plugins/delivery/qc-inspection/dto/qc-inspection.dto';
import {
  DEFECT_SELECT,
  toDefectView,
  type QcDefectView,
  type RawRow,
} from '@plugins/delivery/qc-inspection/services/qc-views';
import { ProductionUnitPort } from '@plugins/production/_shared/ports/production-unit.port';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/**
 * Defects: `open → fixed` by the fixer, `fixed → verified` by someone else. Both writes take the
 * cabinet through the production port first (header, then cabinet row), then check the scope,
 * then lock the defect row and check its status, so two writes on one defect serialise.
 */
@Injectable()
export class QcDefectService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly units: ProductionUnitPort,
    private readonly production: OrderProductionPort,
  ) {}

  async list(query: QcDefectFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const reach = this.orderScope(actor)('po.order_id');
    const params: unknown[] = [...reach.params];
    const conditions = ['d.is_deleted = false', reach.sql];
    if (query.status) {
      params.push(query.status);
      conditions.push(`d.status = $${params.length}`);
    }
    if (query.unitId !== undefined) {
      params.push(query.unitId);
      conditions.push(`d.unit_id = $${params.length}`);
    }
    params.push(take, skip);
    const rows: RawRow[] = await this.dataSource.query(
      `${DEFECT_SELECT}
        WHERE ${conditions.map((part) => `(${part})`).join(' AND ')}
        ORDER BY d.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const [{ total }]: Array<{ total: string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS total
         FROM qc_defects d
         JOIN production_units u ON u.id = d.unit_id
         JOIN production_orders po ON po.id = u.production_order_id
        WHERE ${conditions.map((part) => `(${part})`).join(' AND ')}`,
      params.slice(0, params.length - 2),
    );
    return paginate(rows.map(toDefectView), Number(total), page, limit);
  }

  fix(id: number, dto: FixQcDefectDto, actor: AuthUserPayload) {
    return this.write(id, actor, async (manager, defect) => {
      if (defect.status !== QcDefectStatus.OPEN) {
        throw new ConflictException(
          `Defect ${id} is ${String(defect.status)}, not open.`,
        );
      }
      await manager.query(
        `UPDATE qc_defects
            SET status = $2, fix_note = $3, fixed_by = $4, fixed_at = NOW(),
                updated_by = $4, updated_at = NOW()
          WHERE id = $1`,
        [id, QcDefectStatus.FIXED, dto.note, actor.userId],
      );
    });
  }

  verify(id: number, actor: AuthUserPayload) {
    return this.write(id, actor, async (manager, defect) => {
      if (defect.status !== QcDefectStatus.FIXED) {
        throw new ConflictException(
          `Defect ${id} is ${String(defect.status)}, not fixed.`,
        );
      }
      // Whoever fixed a defect cannot also vouch for it.
      if (Number(defect.fixed_by) === actor.userId) {
        throw new ConflictException(
          'A defect must be verified by someone other than who fixed it.',
        );
      }
      await manager.query(
        `UPDATE qc_defects
            SET status = $2, verified_by = $3, verified_at = NOW(),
                updated_by = $3, updated_at = NOW()
          WHERE id = $1`,
        [id, QcDefectStatus.VERIFIED, actor.userId],
      );
    });
  }

  private async write(
    id: number,
    actor: AuthUserPayload,
    apply: (manager: EntityManager, defect: RawRow) => Promise<void>,
  ): Promise<QcDefectView> {
    const [head]: RawRow[] = await this.dataSource.query(
      `SELECT unit_id FROM qc_defects WHERE id = $1 AND is_deleted = false`,
      [id],
    );
    if (!head) throw new NotFoundException('Defect not found');
    const unitId = Number(head.unit_id);
    await this.dataSource.transaction(async (manager) => {
      await this.units.lockUnit(manager, unitId);
      await assertUnitVisible(
        manager,
        this.units,
        this.orderScope(actor),
        unitId,
      );
      const [defect]: RawRow[] = await manager.query(
        `SELECT id, status, fixed_by FROM qc_defects
          WHERE id = $1 AND is_deleted = false FOR UPDATE`,
        [id],
      );
      await apply(manager, defect);
    });
    const [row]: RawRow[] = await this.dataSource.query(
      `${DEFECT_SELECT} WHERE d.id = $1`,
      [id],
    );
    return toDefectView(row);
  }

  private orderScope(actor: AuthUserPayload) {
    return deliveryOrderScope(
      this.dataScope.scopeOf(actor),
      actor,
      this.production,
    );
  }
}
