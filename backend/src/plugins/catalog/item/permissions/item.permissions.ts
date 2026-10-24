export const ITEM_READ = 'item:read' as const;
export const ITEM_CREATE = 'item:create' as const;
export const ITEM_UPDATE = 'item:update' as const;
export const ITEM_DELETE = 'item:delete' as const;
export const ITEM_IMPORT = 'item:import' as const;

export const itemPermissions = [
  ITEM_READ,
  ITEM_CREATE,
  ITEM_UPDATE,
  ITEM_DELETE,
  ITEM_IMPORT,
] as const;
