export const SUPPLIER_READ = 'supplier:read' as const;
export const SUPPLIER_CREATE = 'supplier:create' as const;
export const SUPPLIER_UPDATE = 'supplier:update' as const;
export const SUPPLIER_DELETE = 'supplier:delete' as const;

export const supplierPermissions = [
  SUPPLIER_READ,
  SUPPLIER_CREATE,
  SUPPLIER_UPDATE,
  SUPPLIER_DELETE,
] as const;
