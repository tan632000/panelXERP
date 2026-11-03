import { ConflictException, NotFoundException } from '@nestjs/common';

import { PRODUCTION_ORDER_LABEL } from '@plugins/production/production-order/constants/production-order.constant';
import { ProductionOrderEvent } from '@plugins/production/production-order/entities/production-order-event.entity';
import { ProductionOrder } from '@plugins/production/production-order/entities/production-order.entity';
import { ProductionUnit } from '@plugins/production/production-order/entities/production-unit.entity';

import type { ProductionOrderEventType } from '@plugins/production/production-order/enums/production-order-event.enum';
import type { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';
import type { EntityManager } from 'typeorm';

/** The header, `FOR UPDATE` for the rest of the transaction; 404 when missing or deleted. */
export async function lockProductionOrder(
  manager: EntityManager,
  id: number,
): Promise<ProductionOrder> {
  const order = await manager.getRepository(ProductionOrder).findOne({
    where: { id, isDeleted: false },
    lock: { mode: 'pessimistic_write' },
  });
  if (!order) {
    throw new NotFoundException(`${PRODUCTION_ORDER_LABEL} not found`);
  }
  return order;
}

/** The sales order a production order belongs to, read without a lock (it never changes). */
export async function orderIdOf(
  manager: EntityManager,
  id: number,
): Promise<number> {
  const head = await manager.getRepository(ProductionOrder).findOne({
    where: { id, isDeleted: false },
    select: { id: true, orderId: true },
  });
  if (!head) throw new NotFoundException(`${PRODUCTION_ORDER_LABEL} not found`);
  return head.orderId;
}

export function assertProductionStatus(
  order: ProductionOrder,
  allowed: readonly ProductionOrderStatus[],
  action: string,
): void {
  if (!allowed.includes(order.status)) {
    throw new ConflictException(
      `${PRODUCTION_ORDER_LABEL} ${order.code} is ${order.status} and cannot be ${action}.`,
    );
  }
}

/** Moves the header only if it still has the status this transaction read under the lock. */
export async function moveProductionOrder(
  manager: EntityManager,
  order: ProductionOrder,
  to: ProductionOrderStatus,
  patch: Partial<ProductionOrder> = {},
): Promise<void> {
  const result = await manager
    .getRepository(ProductionOrder)
    .update({ id: order.id, status: order.status }, { ...patch, status: to });
  if (result.affected !== 1) {
    throw new ConflictException(
      `${PRODUCTION_ORDER_LABEL} ${order.code} changed while it was being moved to ${to}.`,
    );
  }
}

/** Every unit of the order, `FOR UPDATE` in ascending id (the global lock order). */
export function lockUnits(
  manager: EntityManager,
  productionOrderId: number,
): Promise<ProductionUnit[]> {
  return manager
    .getRepository(ProductionUnit)
    .createQueryBuilder('unit')
    .setLock('pessimistic_write')
    .where('unit.productionOrderId = :productionOrderId', { productionOrderId })
    .andWhere('unit.isDeleted = false')
    .orderBy('unit.id', 'ASC')
    .getMany();
}

const CABINET_NOT_FOUND = 'Production cabinet not found';

/**
 * The write path of one cabinet: its header `FOR UPDATE`, then the unit rows by ascending id
 * (the global lock order), then the checks on the locked rows. The header of a unit never
 * changes, so it is read before any lock is taken. A cabinet the actor may not work answers
 * 404, a header in the wrong status 409.
 */
export async function lockUnitForWork(
  manager: EntityManager,
  unitId: number,
  mayWork: (unit: ProductionUnit) => boolean,
  allowed: readonly ProductionOrderStatus[],
  action: string,
): Promise<{ order: ProductionOrder; unit: ProductionUnit }> {
  const head = await manager.getRepository(ProductionUnit).findOne({
    where: { id: unitId, isDeleted: false },
    select: { id: true, productionOrderId: true },
  });
  if (!head) throw new NotFoundException(CABINET_NOT_FOUND);
  const order = await lockProductionOrder(manager, head.productionOrderId);
  const unit = (await lockUnits(manager, head.productionOrderId)).find(
    (candidate) => candidate.id === unitId,
  );
  if (!unit || !mayWork(unit)) throw new NotFoundException(CABINET_NOT_FOUND);
  assertProductionStatus(order, allowed, action);
  return { order, unit };
}

export async function recordProductionEvent(
  manager: EntityManager,
  productionOrderId: number,
  event: ProductionOrderEventType,
  actorId: number,
  detail: { unitCode?: string; reason?: string } = {},
): Promise<void> {
  await manager.getRepository(ProductionOrderEvent).insert({
    productionOrderId,
    event,
    actorId,
    unitCode: detail.unitCode ?? null,
    reason: detail.reason ?? null,
  });
}
