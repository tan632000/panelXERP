import { NotFoundException } from '@nestjs/common';

import type { ProductionUnitPort } from '@plugins/production/_shared/ports/production-unit.port';
import type { ScopeCondition } from '@plugins/production/production-order/utils/production-scope.util';
import type { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';
import type { DataScope } from '@shared/services/data-scope.service';
import type { EntityManager } from 'typeorm';

/**
 * The orders a scope reaches for every delivery record, in SQL on the caller's order column
 * (`po.order_id`): every order for `all` and `material`, the orders whose current owner is the
 * actor for `ownSales`, nothing for any other scope. The condition's parameters are numbered
 * from `$1`, so a query binds them first.
 */
export function deliveryOrderScope(
  scope: DataScope,
  actor: { userId: number },
  orders: OrderProductionPort,
): (column: string) => ScopeCondition {
  return (column) => {
    switch (scope) {
      case 'all':
      case 'material':
        return { sql: 'TRUE', params: [] };
      case 'ownSales':
        return orders.ownerScopeCondition(column, actor, 1);
      case 'assignedEngineer':
      case 'assignedTechnician':
        return { sql: 'FALSE', params: [] };
    }
  };
}

/** A cabinet outside the scope answers 404, so its existence is not disclosed. */
export async function assertUnitVisible(
  manager: EntityManager,
  units: ProductionUnitPort,
  orderScope: (column: string) => ScopeCondition,
  unitId: number,
): Promise<void> {
  const reached = await units.listUnits(manager, { orderScope, unitId });
  if (reached.length === 0) {
    throw new NotFoundException('Production cabinet not found');
  }
}
