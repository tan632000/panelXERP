export const CUSTOMER_READ = 'customer:read' as const;
export const CUSTOMER_CREATE = 'customer:create' as const;
export const CUSTOMER_UPDATE = 'customer:update' as const;
export const CUSTOMER_DELETE = 'customer:delete' as const;

export const customerPermissions = [
  CUSTOMER_READ,
  CUSTOMER_CREATE,
  CUSTOMER_UPDATE,
  CUSTOMER_DELETE,
] as const;
