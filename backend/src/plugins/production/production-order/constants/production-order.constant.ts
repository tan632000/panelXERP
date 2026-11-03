export const PRODUCTION_ORDER_TABLE = 'production_orders';
export const PRODUCTION_ORDER_CODE_PREFIX = 'LSX';
export const PRODUCTION_ORDER_CODE_INDEX = 'uq_production_orders_code';
/** At most one non-cancelled production order per sales order. */
export const PRODUCTION_ORDER_LIVE_INDEX = 'uq_production_orders_order_live';
export const PRODUCTION_ORDER_LABEL = 'Production order';

/** The role a unit may be assigned to. */
export const PRODUCTION_TECHNICIAN_ROLE = 'technician';

/** Name production registers under at the order lifecycle (the cancel veto). */
export const PRODUCTION_LIFECYCLE_HOOK = 'production-order';

/** Orders the create picker reads per round trip to the order list. */
export const OPEN_ORDER_BATCH = 100;
export const OPEN_ORDER_DEFAULT_LIMIT = 50;
export const OPEN_ORDER_MAX_LIMIT = 100;

export const PRODUCTION_ORDER_RELEASED_EVENT = 'production.order.released';
export const PRODUCTION_ORDER_RELEASED_OWNER_EVENT =
  'production.order.released.owner';
export const PRODUCTION_ORDER_CANCELLED_EVENT = 'production.order.cancelled';
export const PRODUCTION_ORDER_CANCELLED_OWNER_EVENT =
  'production.order.cancelled.owner';
export const PRODUCTION_UNIT_ASSIGNED_EVENT = 'production.unit.assigned';
export const PRODUCTION_ORDER_COMPLETED_EVENT = 'production.order.completed';
export const PRODUCTION_ORDER_COMPLETED_OWNER_EVENT =
  'production.order.completed.owner';
/** The role told when every cabinet is finished. */
export const PRODUCTION_MANAGER_ROLE = 'productionManager';
/** A problem reported on a cabinet (role: production managers), and its closing (user: reporter). */
export const PRODUCTION_ISSUE_OPENED_EVENT = 'production.issue.opened';
export const PRODUCTION_ISSUE_RESOLVED_EVENT = 'production.issue.resolved';

/** A cabinet past its planned end date: told to the production managers (role) and its assignee (user). */
export const PRODUCTION_UNIT_OVERDUE_EVENT = 'production.unit.overdue';
export const PRODUCTION_UNIT_OVERDUE_ASSIGNEE_EVENT =
  'production.unit.overdue.assignee';
