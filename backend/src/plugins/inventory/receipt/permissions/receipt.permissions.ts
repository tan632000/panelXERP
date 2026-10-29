export const STOCK_RECEIPT_READ = 'stock_receipt:read' as const;
/** Receive the goods of an approved purchase order into stock. */
export const STOCK_RECEIPT_CREATE = 'stock_receipt:create' as const;

export const stockReceiptPermissions = [
  STOCK_RECEIPT_READ,
  STOCK_RECEIPT_CREATE,
] as const;
