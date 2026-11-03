/** Where a production order stands: `draft → released → completed`, or `cancelled` from either of the first two. */
export enum ProductionOrderStatus {
  DRAFT = 'draft',
  RELEASED = 'released',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/** Statuses a cancel may start from. */
export const PRODUCTION_ORDER_CANCELLABLE: readonly ProductionOrderStatus[] = [
  ProductionOrderStatus.DRAFT,
  ProductionOrderStatus.RELEASED,
];

/** Statuses in which a unit's assignee or planned end date may still change. */
export const PRODUCTION_ORDER_EDITABLE: readonly ProductionOrderStatus[] = [
  ProductionOrderStatus.DRAFT,
  ProductionOrderStatus.RELEASED,
];
