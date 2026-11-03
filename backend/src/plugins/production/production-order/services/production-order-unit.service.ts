import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { vnToday } from '@plugins/production/_shared/utils/vn-today.util';
import {
  PRODUCTION_ORDER_LABEL,
  PRODUCTION_TECHNICIAN_ROLE,
} from '@plugins/production/production-order/constants/production-order.constant';
import { UpdateProductionUnitDto } from '@plugins/production/production-order/dto/production-order.dto';
import { ProductionUnit } from '@plugins/production/production-order/entities/production-unit.entity';
import { ProductionOrderEventType } from '@plugins/production/production-order/enums/production-order-event.enum';
import {
  PRODUCTION_ORDER_EDITABLE,
  ProductionOrderStatus,
} from '@plugins/production/production-order/enums/production-order-status.enum';
import {
  ProductionStage,
  ProductionStageStatus,
} from '@plugins/production/production-order/enums/production-stage.enum';
import { ProductionOrderNotifier } from '@plugins/production/production-order/services/production-order-notifier.service';
import { ProductionOrderQueryService } from '@plugins/production/production-order/services/production-order-query.service';
import {
  assertProductionStatus,
  lockProductionOrder,
  recordProductionEvent,
} from '@plugins/production/production-order/utils/production-order-lock.util';
import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/**
 * Who builds a cabinet and by when. Every write takes the production order header `FOR UPDATE`
 * and then the unit row (global lock order), and checks the header status on the locked row, so
 * a change queued behind a release or a cancel sees what that decision committed.
 */
@Injectable()
export class ProductionOrderUnitService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly users: SalesUserLookup,
    private readonly queries: ProductionOrderQueryService,
    private readonly notifier: ProductionOrderNotifier,
  ) {}

  async update(
    id: number,
    unitId: number,
    dto: UpdateProductionUnitDto,
    actor: AuthUserPayload,
  ) {
    // Read before any lock is taken: a role check must not hold the header while it waits.
    let assigneeName: string | null = null;
    if (dto.assigneeId !== undefined) {
      if (
        !(await this.users.hasActiveRole(dto.assigneeId, [
          PRODUCTION_TECHNICIAN_ROLE,
        ]))
      ) {
        throw new BadRequestException(
          'The assignee must be an active technician.',
        );
      }
      assigneeName =
        (await this.users.namesOf([dto.assigneeId])).get(dto.assigneeId) ??
        null;
    }

    const outcome = await this.dataSource.transaction(async (manager) => {
      const order = await lockProductionOrder(manager, id);
      assertProductionStatus(order, PRODUCTION_ORDER_EDITABLE, 'changed');
      const unit = await manager.getRepository(ProductionUnit).findOne({
        where: { id: unitId, productionOrderId: id, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!unit) {
        throw new NotFoundException(
          `${PRODUCTION_ORDER_LABEL} cabinet not found`,
        );
      }
      const [finished]: Array<{ done: boolean }> = await manager.query(
        `SELECT EXISTS (SELECT 1 FROM production_unit_stages
                         WHERE unit_id = $1 AND stage = $2 AND status = $3) AS done`,
        [unit.id, ProductionStage.FINISHING, ProductionStageStatus.DONE],
      );
      if (finished.done) {
        throw new ConflictException(
          `Cabinet ${unit.code} is finished and cannot be changed.`,
        );
      }

      const assigneeChanged =
        dto.assigneeId !== undefined && dto.assigneeId !== unit.assigneeId;
      const planChanged =
        dto.plannedEndDate !== undefined &&
        dto.plannedEndDate !== unit.plannedEndDate;
      if (assigneeChanged || planChanged) {
        await manager.getRepository(ProductionUnit).update(unit.id, {
          ...(assigneeChanged ? { assigneeId: dto.assigneeId } : {}),
          ...(planChanged ? { plannedEndDate: dto.plannedEndDate } : {}),
          updatedBy: actor.userId,
        });
        // A notice must not outlive what it reports: the old assignee's goes with the
        // reassignment, both go once the new date is no longer in the past.
        if (planChanged && (dto.plannedEndDate ?? '') >= vnToday()) {
          await this.notifier.clearOverdue(manager, [unit.id]);
        } else if (assigneeChanged) {
          await this.notifier.clearOverdue(manager, [unit.id], 'assignee');
        }
        await recordProductionEvent(
          manager,
          id,
          ProductionOrderEventType.UNIT_UPDATED,
          actor.userId,
          {
            unitCode: unit.code,
            reason: [
              assigneeChanged
                ? `assignee: ${assigneeName ?? dto.assigneeId}`
                : null,
              planChanged ? `planned end: ${dto.plannedEndDate}` : null,
            ]
              .filter(Boolean)
              .join('; '),
          },
        );
      }
      return { order, unit, notify: assigneeChanged };
    });

    // A draft tells its technicians at release; only a released order notifies a new hand.
    if (
      outcome.notify &&
      dto.assigneeId !== undefined &&
      outcome.order.status === ProductionOrderStatus.RELEASED
    ) {
      await this.notifier.assigned(
        outcome.order,
        outcome.unit,
        dto.assigneeId,
        actor.userId,
      );
    }
    return this.queries.findOne(id, actor);
  }
}
