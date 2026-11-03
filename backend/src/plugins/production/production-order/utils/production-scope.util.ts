import type { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';
import type { DataScope } from '@shared/services/data-scope.service';

/** A SQL condition and the parameters it binds, numbered from `nextParameter`. */
export interface ScopeCondition {
  sql: string;
  params: unknown[];
}

/**
 * The production orders (`po`) a scope reaches, in SQL: everything for `all` and
 * `material`; the orders whose sales order the actor owns now for `ownSales`; the orders with at
 * least one unit assigned to the actor for `assignedTechnician`; nothing for any other scope.
 */
export function productionOrderScope(
  scope: DataScope,
  actor: { userId: number },
  orders: OrderProductionPort,
  nextParameter: number,
): ScopeCondition {
  switch (scope) {
    case 'all':
    case 'material':
      return { sql: 'TRUE', params: [] };
    case 'ownSales':
      return orders.ownerScopeCondition('po.order_id', actor, nextParameter);
    case 'assignedTechnician':
      return {
        sql: `EXISTS (SELECT 1 FROM production_units su
                       WHERE su.production_order_id = po.id AND su.is_deleted = false
                         AND su.assignee_id = $${nextParameter})`,
        params: [actor.userId],
      };
    case 'assignedEngineer':
      return { sql: 'FALSE', params: [] };
  }
}

/** The cabinets (`unit`) a scope may list inside a production order it reaches. */
export function unitScope(
  scope: DataScope,
  actor: { userId: number },
  nextParameter: number,
): ScopeCondition {
  return scope === 'assignedTechnician'
    ? { sql: `unit.assignee_id = $${nextParameter}`, params: [actor.userId] }
    : { sql: 'TRUE', params: [] };
}

/** A technician works only the cabinets assigned to them now; a manager any cabinet. */
export function mayWorkUnit(
  scope: DataScope,
  unit: { assigneeId?: number | null },
  actor: { userId: number },
): boolean {
  switch (scope) {
    case 'all':
    case 'material':
      return true;
    case 'assignedTechnician':
      return unit.assigneeId === actor.userId;
    default:
      return false;
  }
}
