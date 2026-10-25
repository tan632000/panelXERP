import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';

import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import {
  requireText,
  trimToNull,
} from '@plugins/sales/_shared/utils/text.util';
import { UpdateOrderDto } from '@plugins/sales/order/dto/update-order.dto';
import { SalesOrder } from '@plugins/sales/order/entities/order.entity';
import { OrderStatus } from '@plugins/sales/order/enums/order-status.enum';
import {
  OrderService,
  type OrderDetail,
} from '@plugins/sales/order/services/order.service';
import { lockOrder } from '@plugins/sales/order/utils/order-lock.util';
import { RequestReasonDto } from '@plugins/sales/request/dto/request-reason.dto';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

/**
 * What may still change on an order while it is open: its contract number, contract date and
 * delivery date, and its cancellation. Lines, prices, totals and snapshots have no write path
 * at all. Each write takes the request and then the order `FOR UPDATE` (see `lockOrder`).
 */
@Injectable()
export class OrderEditService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly orders: OrderService,
    private readonly statusPort: RequestStatusPort,
  ) {}

  async update(
    id: number,
    dto: UpdateOrderDto,
    actor: AuthUserPayload,
  ): Promise<OrderDetail> {
    await this.dataSource.transaction(async (manager) => {
      const { order, request } = await lockOrder(
        manager,
        this.dataScope,
        id,
        actor,
      );
      this.assertOpen(order, 'edited');

      const patch: Partial<SalesOrder> = {};
      if (dto.contractNo !== undefined) {
        patch.contractNo = trimToNull(dto.contractNo);
      }
      if (dto.contractDate !== undefined) patch.contractDate = dto.contractDate;
      if (dto.deliveryDate !== undefined) patch.deliveryDate = dto.deliveryDate;
      const changed = (Object.keys(patch) as Array<keyof typeof patch>).some(
        (key) => (patch[key] ?? null) !== (order[key] ?? null),
      );
      // A save that changes nothing leaves no trace on the request's timeline.
      if (!changed) return;

      await this.moveOpenOrder(manager, order, 'edited', {
        ...patch,
        updatedBy: actor.userId,
      });
      await recordRequestActivity(manager, {
        requestId: request.id,
        action: 'order_updated',
        actorId: actor.userId,
        note: order.code,
      });
    });
    return this.orders.findOne(id, actor);
  }

  /**
   * Ends the order for a stated reason, and with it the request: the sale is lost. This is the
   * only way a request leaves `won`. The quotation stays confirmed and is never converted
   * again; a returning customer gets a new request.
   */
  async cancel(
    id: number,
    dto: RequestReasonDto,
    actor: AuthUserPayload,
  ): Promise<OrderDetail> {
    const reason = requireText(dto.reason, 'Reason is required.');
    await this.dataSource.transaction(async (manager) => {
      const { order, request } = await lockOrder(
        manager,
        this.dataScope,
        id,
        actor,
      );
      this.assertOpen(order, 'cancelled');

      await this.moveOpenOrder(manager, order, 'cancelled', {
        status: OrderStatus.CANCELLED,
        cancelReason: reason,
        cancelledBy: actor.userId,
        cancelledAt: new Date(),
        updatedBy: actor.userId,
      });

      const lost = await this.statusPort.advance(
        manager,
        request.id,
        RequestStatus.LOST,
        { actorId: actor.userId, note: reason },
      );
      lost.lostReason = reason;
      await manager.getRepository(SalesRequest).save(lost);
      await recordRequestActivity(manager, {
        requestId: request.id,
        action: 'order_cancelled',
        actorId: actor.userId,
        note: `${order.code}: ${reason}`,
      });
    });
    return this.orders.findOne(id, actor);
  }

  /**
   * Writes the patch only if the order still has the status this transaction read under the
   * lock (`UPDATE … WHERE status = :expected`), so a writer that bypassed the lock cannot be
   * overwritten with a stale read.
   */
  private async moveOpenOrder(
    manager: EntityManager,
    order: SalesOrder,
    action: string,
    patch: QueryDeepPartialEntity<SalesOrder>,
  ): Promise<void> {
    const result = await manager
      .getRepository(SalesOrder)
      .update({ id: order.id, status: OrderStatus.OPEN }, patch);
    if (result.affected !== 1) {
      throw new ConflictException(
        `Order ${order.code} changed while it was being ${action}.`,
      );
    }
  }

  private assertOpen(order: SalesOrder, action: string): void {
    if (order.status !== OrderStatus.OPEN) {
      throw new ConflictException(
        `Order ${order.code} is ${order.status} and cannot be ${action}.`,
      );
    }
  }
}
