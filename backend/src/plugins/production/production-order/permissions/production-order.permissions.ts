export const PRODUCTION_ORDER_READ = 'production_order:read' as const;
export const PRODUCTION_ORDER_CREATE = 'production_order:create' as const;
/** Assign technicians and planned end dates to the cabinets. */
export const PRODUCTION_ORDER_UPDATE = 'production_order:update' as const;
export const PRODUCTION_ORDER_RELEASE = 'production_order:release' as const;
export const PRODUCTION_ORDER_CANCEL = 'production_order:cancel' as const;

export const productionOrderPermissions = [
  PRODUCTION_ORDER_READ,
  PRODUCTION_ORDER_CREATE,
  PRODUCTION_ORDER_UPDATE,
  PRODUCTION_ORDER_RELEASE,
  PRODUCTION_ORDER_CANCEL,
] as const;
