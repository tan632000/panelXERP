/**
 * Gates every actual purchase cost: average cost, stock value, movement cost and value. The
 * catalog item feature declares and seeds this scope; inventory only reads it, so it is not in
 * any inventory feature's permission list.
 */
export const PURCHASE_PRICE_READ = 'purchase_price:read' as const;
