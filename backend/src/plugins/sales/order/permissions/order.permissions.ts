export const ORDER_READ = 'order:read' as const;
export const ORDER_CREATE = 'order:create' as const;
export const ORDER_UPDATE = 'order:update' as const;
export const ORDER_CANCEL = 'order:cancel' as const;

export const orderPermissions = [
  ORDER_READ,
  ORDER_CREATE,
  ORDER_UPDATE,
  ORDER_CANCEL,
] as const;
