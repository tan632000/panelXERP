import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { requireText } from '@plugins/inventory/_shared/utils/text.util';
import { ProductionOrderReasonDto } from '@plugins/production/production-order/dto/production-order.dto';
import { ProductionOrderEventType } from '@plugins/production/production-order/enums/production-order-event.enum';
import {
  PRODUCTION_ORDER_CANCELLABLE,
  ProductionOrderStatus,
} from '@plugins/production/production-order/enums/production-order-status.enum';
import { ProductionOrderNotifier } from '@plugins/production/production-order/services/production-order-notifier.service';
import { ProductionOrderQueryService } from '@plugins/production/production-order/services/production-order-query.service';
import {
  assertProductionStatus,
  lockProductionOrder,
  lockUnits,
  moveProductionOrder,
  orderIdOf,
  recordProductionEvent,
} from '@plugins/production/production-order/utils/production-order-lock.util';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';
import { OrderFollowerNotifier } from '@plugins/sales/_shared/services/order-follower-notifier';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

const OPEN = 'open';
const IN_PRODUCTION = 'in_production';

/**
 * Release and cancel: the two decisions that move the sales order. Each takes the locks in the
 * global order — order row, production order header, unit rows by ascending id — and moves the
 * header with `UPDATE … WHERE status = :expected`. Notices go out after the commit.
 */
@Injectable()
export class ProductionOrderReleaseService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrderProductionPort,
    private readonly queries: ProductionOrderQueryService,
    private readonly notifier: ProductionOrderNotifier,
    private readonly followers: OrderFollowerNotifier,
  ) {}

  /**
   * Hands a draft to the workshop: every cabinet must have a technician and a planned end
   * date (400 lists the codes that lack either), and the order goes `open → in_production`.
   */
  async release(id: number, actor: AuthUserPayload) {
    const { order, assigneeIds } = await this.dataSource.transaction(
      async (manager) => {
        await this.lockOrderRow(manager, await orderIdOf(manager, id));
        const held = await lockProductionOrder(manager, id);
        assertProductionStatus(held, [ProductionOrderStatus.DRAFT], 'released');
        const units = await lockUnits(manager, id);
        const incomplete = units.filter(
          (unit) => !unit.assigneeId || !unit.plannedEndDate,
        );
        if (incomplete.length > 0) {
          throw new BadRequestException(
            `Every cabinet needs a technician and a planned end date: ${incomplete
              .map((unit) => unit.code)
              .join(', ')}.`,
          );
        }
        await this.orders.moveStatus(
          manager,
          held.orderId,
          OPEN,
          IN_PRODUCTION,
        );
        await moveProductionOrder(
          manager,
          held,
          ProductionOrderStatus.RELEASED,
          {
            releasedAt: new Date(),
            releasedBy: actor.userId,
            updatedBy: actor.userId,
          },
        );
        await recordProductionEvent(
          manager,
          id,
          ProductionOrderEventType.RELEASED,
          actor.userId,
        );
        return {
          order: held,
          assigneeIds: units.map((unit) => Number(unit.assigneeId)),
        };
      },
    );

    await this.notifier.released(order, assigneeIds, actor.userId);
    // The production notice already told the owner.
    await this.followers.notify(
      order.orderId,
      'production_released',
      actor.userId,
      { extra: { productionOrderCode: order.code }, skipOwner: true },
    );
    return this.queries.findOne(id, actor);
  }

  /**
   * Ends a draft or released production order for a stated reason. A released one gives the
   * order back (`in_production → open`); the stage history stays.
   */
  async cancel(
    id: number,
    dto: ProductionOrderReasonDto,
    actor: AuthUserPayload,
  ) {
    const reason = requireText(dto.reason, 'Reason is required.');
    const outcome = await this.dataSource.transaction(async (manager) => {
      await this.lockOrderRow(manager, await orderIdOf(manager, id));
      const held = await lockProductionOrder(manager, id);
      assertProductionStatus(held, PRODUCTION_ORDER_CANCELLABLE, 'cancelled');
      const wasReleased = held.status === ProductionOrderStatus.RELEASED;
      const units = wasReleased ? await lockUnits(manager, id) : [];
      if (wasReleased) {
        await this.notifier.clearOverdue(
          manager,
          units.map((unit) => unit.id),
        );
        await this.orders.moveStatus(
          manager,
          held.orderId,
          IN_PRODUCTION,
          OPEN,
        );
      }
      await moveProductionOrder(
        manager,
        held,
        ProductionOrderStatus.CANCELLED,
        {
          cancelReason: reason,
          cancelledAt: new Date(),
          cancelledBy: actor.userId,
          updatedBy: actor.userId,
        },
      );
      await recordProductionEvent(
        manager,
        id,
        ProductionOrderEventType.CANCELLED,
        actor.userId,
        { reason },
      );
      return {
        order: held,
        // Only a released order told its technicians and its owner anything.
        assigneeIds: units.flatMap((unit) =>
          unit.assigneeId ? [unit.assigneeId] : [],
        ),
        wasReleased,
      };
    });

    if (outcome.wasReleased) {
      await this.notifier.cancelled(
        outcome.order,
        outcome.assigneeIds,
        actor.userId,
        reason,
      );
      await this.followers.notify(
        outcome.order.orderId,
        'production_cancelled',
        actor.userId,
        {
          extra: { productionOrderCode: outcome.order.code, reason },
          skipOwner: true,
        },
      );
    }
    return this.queries.findOne(id, actor);
  }

  /** The order row `FOR UPDATE`, the first lock of the global order. */
  private async lockOrderRow(
    manager: EntityManager,
    orderId: number,
  ): Promise<void> {
    await this.orders.lockForProduction(manager, orderId);
  }
}
