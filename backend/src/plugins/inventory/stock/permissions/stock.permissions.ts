/** Quantities only (on hand, available) — what sales and engineers see while estimating. */
export const STOCK_AVAILABILITY = 'stock:availability' as const;
/** The stock list. */
export const STOCK_READ = 'stock:read' as const;
/** The movements of an item. */
export const STOCK_LEDGER = 'stock:ledger' as const;

export const stockPermissions = [
  STOCK_AVAILABILITY,
  STOCK_READ,
  STOCK_LEDGER,
] as const;
