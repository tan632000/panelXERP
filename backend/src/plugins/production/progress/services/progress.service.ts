import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';

import { ProductionUnitStage } from '@plugins/production/production-order/entities/production-unit-stage.entity';
import { ProductionOrderEventType } from '@plugins/production/production-order/enums/production-order-event.enum';
import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';
import {
  ProductionStage,
  ProductionStageStatus,
} from '@plugins/production/production-order/enums/production-stage.enum';
import { ProductionOrderNotifier } from '@plugins/production/production-order/services/production-order-notifier.service';
import {
  lockUnitForWork,
  moveProductionOrder,
  recordProductionEvent,
} from '@plugins/production/production-order/utils/production-order-lock.util';
import { mayWorkUnit } from '@plugins/production/production-order/utils/production-scope.util';
import { ProgressQueryService } from '@plugins/production/progress/services/progress-query.service';
import { OrderFollowerNotifier } from '@plugins/sales/_shared/services/order-follower-notifier';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { ProductionOrder } from '@plugins/production/production-order/entities/production-order.entity';
import type { EntityManager } from 'typeorm';

type StageAction = 'start' | 'finish' | 'undo';

const CABINET_NOT_FOUND = 'Production cabinet not found';
const WORKING = [ProductionOrderStatus.RELEASED];

/**
 * Starting, finishing and undoing the six stages of a cabinet. Every change takes the production
 * order header `FOR UPDATE`, then the unit rows by ascending id (the global lock order), and
 * re-checks on the locked rows: the header is still released, the actor still owns the cabinet
 * and the stage still has the status this transaction acts on. A change queued behind a
 * reassignment, a cancel or another finish therefore sees what that one committed.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly queries: ProgressQueryService,
    private readonly notifier: ProductionOrderNotifier,
    private readonly followers: OrderFollowerNotifier,
  ) {}

  start(unitId: number, stage: ProductionStage, actor: AuthUserPayload) {
    return this.change(unitId, stage, 'start', actor);
  }

  finish(unitId: number, stage: ProductionStage, actor: AuthUserPayload) {
    return this.change(unitId, stage, 'finish', actor);
  }

  undo(
    unitId: number,
    stage: ProductionStage,
    reason: string,
    actor: AuthUserPayload,
  ) {
    return this.change(unitId, stage, 'undo', actor, reason);
  }

  private async change(
    unitId: number,
    stage: ProductionStage,
    action: StageAction,
    actor: AuthUserPayload,
    reason?: string,
  ) {
    const scope = this.dataScope.scopeOf(actor);
    const completed = await this.dataSource.transaction(async (manager) => {
      const { order, unit } = await lockUnitForWork(
        manager,
        unitId,
        (candidate) => mayWorkUnit(scope, candidate, actor),
        WORKING,
        'progressed',
      );

      const stages = await manager
        .getRepository(ProductionUnitStage)
        .find({ where: { unitId }, order: { seq: 'ASC' } });
      const target = stages.find((candidate) => candidate.stage === stage);
      if (!target) throw new NotFoundException(CABINET_NOT_FOUND);
      const before = stages.find(
        (candidate) => candidate.seq === target.seq - 1,
      );
      const after = stages.find(
        (candidate) => candidate.seq === target.seq + 1,
      );

      switch (action) {
        case 'start':
          if (before && before.status !== ProductionStageStatus.DONE) {
            throw new ConflictException(
              `Stage ${stage} of cabinet ${unit.code} cannot start before ${before.stage} is done.`,
            );
          }
          await this.move(
            manager,
            target,
            ProductionStageStatus.PENDING,
            ProductionStageStatus.IN_PROGRESS,
            { startedAt: new Date(), startedBy: actor.userId },
          );
          await recordProductionEvent(
            manager,
            order.id,
            ProductionOrderEventType.STAGE_STARTED,
            actor.userId,
            { unitCode: unit.code, stage },
          );
          return null;
        case 'finish':
          await this.move(
            manager,
            target,
            ProductionStageStatus.IN_PROGRESS,
            ProductionStageStatus.DONE,
            { doneAt: new Date(), doneBy: actor.userId },
          );
          await recordProductionEvent(
            manager,
            order.id,
            ProductionOrderEventType.STAGE_FINISHED,
            actor.userId,
            { unitCode: unit.code, stage },
          );
          if (stage !== ProductionStage.FINISHING) return null;
          await this.notifier.clearOverdue(manager, [unit.id]);
          return this.completeIfEveryUnitIsDone(manager, order, actor);
        case 'undo':
          if (after && after.status !== ProductionStageStatus.PENDING) {
            throw new ConflictException(
              `Stage ${stage} of cabinet ${unit.code} cannot be undone: ${after.stage} has already started.`,
            );
          }
          await this.move(
            manager,
            target,
            ProductionStageStatus.DONE,
            ProductionStageStatus.IN_PROGRESS,
            { doneAt: null, doneBy: null },
          );
          await recordProductionEvent(
            manager,
            order.id,
            ProductionOrderEventType.STAGE_UNDONE,
            actor.userId,
            { unitCode: unit.code, stage, reason },
          );
          return null;
      }
    });

    if (completed) {
      await this.notifier.completed(completed, actor.userId);
      // The production notice already told the owner and the production managers.
      await this.followers.notify(
        completed.orderId,
        'production_completed',
        actor.userId,
        {
          extra: { productionOrderCode: completed.code },
          skipOwner: true,
          skipRoles: ['productionManager'],
        },
      );
    }
    return this.queries.findOne(unitId, actor);
  }

  /** Moves the stage only if it still has the status this transaction read under the locks. */
  private async move(
    manager: EntityManager,
    stage: ProductionUnitStage,
    from: ProductionStageStatus,
    to: ProductionStageStatus,
    patch: Partial<ProductionUnitStage>,
  ): Promise<void> {
    if (stage.status !== from) {
      throw new ConflictException(
        `Stage ${stage.stage} is ${stage.status}, not ${from}.`,
      );
    }
    const result = await manager
      .getRepository(ProductionUnitStage)
      .update({ id: stage.id, status: from }, { ...patch, status: to });
    if (result.affected !== 1) {
      throw new ConflictException(`Stage ${stage.stage} changed meanwhile.`);
    }
  }

  /** The last `finishing` completes the production order in the transaction that finished it. */
  private async completeIfEveryUnitIsDone(
    manager: EntityManager,
    order: ProductionOrder,
    actor: AuthUserPayload,
  ): Promise<ProductionOrder | null> {
    const [{ open }]: Array<{ open: string }> = await manager.query(
      `SELECT COUNT(*) AS open
         FROM production_units unit
        WHERE unit.production_order_id = $1 AND unit.is_deleted = false
          AND NOT EXISTS (SELECT 1 FROM production_unit_stages s
                           WHERE s.unit_id = unit.id AND s.stage = $2 AND s.status = $3)`,
      [order.id, ProductionStage.FINISHING, ProductionStageStatus.DONE],
    );
    if (Number(open) > 0) return null;
    await moveProductionOrder(manager, order, ProductionOrderStatus.COMPLETED, {
      completedAt: new Date(),
      updatedBy: actor.userId,
    });
    await recordProductionEvent(
      manager,
      order.id,
      ProductionOrderEventType.COMPLETED,
      actor.userId,
    );
    return order;
  }
}
