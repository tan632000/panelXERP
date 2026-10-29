export const receiptPageRoutes = {
  list: "/inventory/receipts",
  /** The receive screen of one approved purchase order. */
  receive: (purchaseOrderId: number | string) =>
    `/inventory/receipts/new?purchaseOrderId=${purchaseOrderId}`,
} as const;

export const receiptApiRoutes = {
  list: "/inventory/receipts",
  detail: (id: number | string) => `/inventory/receipts/${id}`,
  /** The catalog's scan lookup: an active item by barcode, else by code. */
  resolveItem: "/items/resolve",
} as const;

export const receiptQueryKeys = {
  all: ["stock-receipts"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...receiptQueryKeys.all, "list", filters] as const,
};

export const RECEIPT_QUANTITY_DECIMALS = 3;
