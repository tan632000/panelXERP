/**
 * The order statuses that still need their materials: an order in production keeps its demand,
 * its reservation and its issuing. Every demand, shortage and allocation follows this one list.
 */
export const DEMAND_BEARING_STATUSES: readonly string[] = [
  'open',
  'in_production',
];

export const ORDER_SHORT_EVENT = 'inventory.order.short';
export const ORDER_SHORT_OWNER_EVENT = 'inventory.order.short.owner';

/** Name the material feature registers under at the order lifecycle. */
export const MATERIAL_LIFECYCLE_HOOK = 'inventory-material';
