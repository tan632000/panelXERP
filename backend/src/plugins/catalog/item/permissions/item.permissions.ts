export const ITEM_READ = 'item:read' as const;
export const ITEM_CREATE = 'item:create' as const;
export const ITEM_UPDATE = 'item:update' as const;
export const ITEM_DELETE = 'item:delete' as const;
export const ITEM_IMPORT = 'item:import' as const;
export const ITEM_STOCK_SETTINGS = 'item:stock_settings' as const;
/** Gates `referencePrice` on every item response; the storekeeper does not hold it. */
export const REFERENCE_PRICE_READ = 'reference_price:read' as const;
/** Gates every actual purchase cost; declared here so the seed stores it before its consumers exist. */
export const PURCHASE_PRICE_READ = 'purchase_price:read' as const;

export const itemPermissions = [
  ITEM_READ,
  ITEM_CREATE,
  ITEM_UPDATE,
  ITEM_DELETE,
  ITEM_IMPORT,
  ITEM_STOCK_SETTINGS,
  REFERENCE_PRICE_READ,
  PURCHASE_PRICE_READ,
] as const;
