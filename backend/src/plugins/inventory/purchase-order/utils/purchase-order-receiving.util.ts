import { PurchaseOrderStatus } from '@plugins/inventory/purchase-order/enums/purchase-order-status.enum';
import { movePurchaseOrder } from '@plugins/inventory/purchase-order/utils/purchase-order-lock.util';

import type { PurchaseOrder } from '@plugins/inventory/purchase-order/entities/purchase-order.entity';
import type { EntityManager } from 'typeorm';

/**
 * Moves an order to the status its lines' received quantities give it: every line complete →
 * `received`, something received → `partially_received`, nothing → `approved`. The caller holds
 * the header lock and has written `received_qty`; the comparison runs on `numeric`, never on
 * floats.
 */
export async function settleReceivedStatus(
  manager: EntityManager,
  order: PurchaseOrder,
  actorId: number,
): Promise<PurchaseOrderStatus> {
  const [row]: Array<{ complete: boolean; started: boolean }> =
    await manager.query(
      `SELECT COALESCE(bool_and(received_qty >= quantity), false) AS complete,
              COALESCE(bool_or(received_qty > 0), false) AS started
         FROM purchase_order_lines WHERE purchase_order_id = $1`,
      [order.id],
    );
  let next = PurchaseOrderStatus.APPROVED;
  if (row.complete) next = PurchaseOrderStatus.RECEIVED;
  else if (row.started) next = PurchaseOrderStatus.PARTIALLY_RECEIVED;

  if (next !== order.status) {
    await movePurchaseOrder(manager, order, next, { updatedBy: actorId });
  }
  return next;
}
