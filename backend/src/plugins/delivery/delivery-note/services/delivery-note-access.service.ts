import { Injectable, NotFoundException } from '@nestjs/common';

import { DataScopeService } from '@shared/services/data-scope.service';

import { deliveryOrderScope } from '@plugins/delivery/_shared/utils/delivery-scope.util';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { ScopeCondition } from '@plugins/production/production-order/utils/production-scope.util';
import type { EntityManager } from 'typeorm';

export const NOTE_NOT_FOUND = 'Delivery note not found';
export const ORDER_NOT_FOUND = 'Order not found';

/**
 * Which orders, and so which delivery notes, an actor may reach (D-03): one scope condition in
 * SQL on the order id, so a record outside it answers 404 and its existence is not disclosed.
 */
@Injectable()
export class DeliveryNoteAccess {
  constructor(
    private readonly dataScope: DataScopeService,
    private readonly orders: OrderProductionPort,
  ) {}

  orderScope(actor: AuthUserPayload): (column: string) => ScopeCondition {
    return deliveryOrderScope(
      this.dataScope.scopeOf(actor),
      actor,
      this.orders,
    );
  }

  /** 404 unless the order exists and the actor's scope reaches it. */
  async assertOrderVisible(
    manager: EntityManager,
    actor: AuthUserPayload,
    orderId: number,
    message: string,
  ): Promise<void> {
    const reach = this.orderScope(actor)('o.id');
    const rows: unknown[] = await manager.query(
      `SELECT 1 FROM sales_orders o
        WHERE o.id = $${reach.params.length + 1} AND o.is_deleted = false AND (${reach.sql})`,
      [...reach.params, orderId],
    );
    if (rows.length === 0) throw new NotFoundException(message);
  }

  /** The order a note belongs to, which never changes; 404 for an unknown note. */
  async orderOfNote(manager: EntityManager, noteId: number): Promise<number> {
    const [row]: Array<{ order_id: number }> = await manager.query(
      `SELECT order_id FROM delivery_notes WHERE id = $1 AND is_deleted = false`,
      [noteId],
    );
    if (!row) throw new NotFoundException(NOTE_NOT_FOUND);
    return row.order_id;
  }
}
