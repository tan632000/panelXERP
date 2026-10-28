import { ConflictException, NotFoundException } from '@nestjs/common';

import { PURCHASE_ORDER_LABEL } from '@plugins/inventory/purchase-order/constants/purchase-order.constant';
import { PurchaseOrderEvent } from '@plugins/inventory/purchase-order/entities/purchase-order-event.entity';
import { PurchaseOrder } from '@plugins/inventory/purchase-order/entities/purchase-order.entity';

import type { PurchaseOrderEventType } from '@plugins/inventory/purchase-order/enums/purchase-order-event.enum';
import type { PurchaseOrderStatus } from '@plugins/inventory/purchase-order/enums/purchase-order-status.enum';
import type { EntityManager } from 'typeorm';

/** The header, `FOR UPDATE` for the rest of the transaction; 404 when missing or deleted. */
export async function lockPurchaseOrder(
  manager: EntityManager,
  id: number,
): Promise<PurchaseOrder> {
  const order = await manager.getRepository(PurchaseOrder).findOne({
    where: { id, isDeleted: false },
    lock: { mode: 'pessimistic_write' },
  });
  if (!order) throw new NotFoundException(`${PURCHASE_ORDER_LABEL} not found`);
  return order;
}

export function assertPurchaseOrderStatus(
  order: PurchaseOrder,
  allowed: readonly PurchaseOrderStatus[],
  action: string,
): void {
  if (!allowed.includes(order.status)) {
    throw new ConflictException(
      `${PURCHASE_ORDER_LABEL} ${order.code} is ${order.status} and cannot be ${action}.`,
    );
  }
}

/** Moves the order only if it still has the status this transaction read under the lock. */
export async function movePurchaseOrder(
  manager: EntityManager,
  order: PurchaseOrder,
  to: PurchaseOrderStatus,
  patch: Partial<PurchaseOrder> = {},
): Promise<void> {
  const result = await manager
    .getRepository(PurchaseOrder)
    .update({ id: order.id, status: order.status }, { ...patch, status: to });
  if (result.affected !== 1) {
    throw new ConflictException(
      `${PURCHASE_ORDER_LABEL} ${order.code} changed while it was being moved to ${to}.`,
    );
  }
}

export async function recordPurchaseOrderEvent(
  manager: EntityManager,
  orderId: number,
  event: PurchaseOrderEventType,
  actorId: number,
  reason: string | null = null,
): Promise<void> {
  await manager
    .getRepository(PurchaseOrderEvent)
    .insert({ purchaseOrderId: orderId, event, actorId, reason });
}
