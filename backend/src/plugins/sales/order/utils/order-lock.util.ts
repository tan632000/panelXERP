import { NotFoundException } from '@nestjs/common';

import { SalesOrder } from '@plugins/sales/order/entities/order.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { DataScopeService } from '@shared/services/data-scope.service';
import type { EntityManager } from 'typeorm';

export const ORDER_LABEL = 'Order';

/** What an order write works on: the locked request and the locked order. */
export interface LockedOrder {
  order: SalesOrder;
  request: SalesRequest;
}

/**
 * Locks the order's request and then the order itself, both `FOR UPDATE` for the rest of the
 * transaction, and checks the actor's data scope reaches the request (404 otherwise). The
 * request comes first, as in every write of the sales chain (estimate → request → quotation
 * header → order), so an order write cannot deadlock against a request or quotation write.
 */
export async function lockOrder(
  manager: EntityManager,
  dataScope: DataScopeService,
  id: number,
  actor: AuthUserPayload,
): Promise<LockedOrder> {
  const orderRepo = manager.getRepository(SalesOrder);

  const head = await orderRepo.findOne({ where: { id, isDeleted: false } });
  if (!head) throw new NotFoundException(`${ORDER_LABEL} not found`);
  const request = dataScope.assertVisible(
    actor,
    await manager.getRepository(SalesRequest).findOne({
      where: { id: head.requestId, isDeleted: false },
      lock: { mode: 'pessimistic_write' },
    }),
    ORDER_LABEL,
  );

  const order = await orderRepo.findOne({
    where: { id, isDeleted: false },
    lock: { mode: 'pessimistic_write' },
  });
  if (!order) throw new NotFoundException(`${ORDER_LABEL} not found`);
  return { order, request };
}
