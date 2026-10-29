export const supplierReturnPageRoutes = {
  /** The return form of one purchase order. */
  create: (purchaseOrderId: number | string) =>
    `/inventory/supplier-returns/new?purchaseOrderId=${purchaseOrderId}`,
} as const;

export const supplierReturnApiRoutes = {
  list: "/inventory/supplier-returns",
  /** The catalog's scan lookup: an active item by barcode, else by code. */
  resolveItem: "/items/resolve",
} as const;

export const supplierReturnQueryKeys = {
  all: ["supplier-returns"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...supplierReturnQueryKeys.all, "list", filters] as const,
};

/** Purchase order statuses goods may go back from: a closed order too. */
export const SUPPLIER_RETURNABLE_STATUSES = [
  "partially_received",
  "received",
  "closed",
] as const;

export const SUPPLIER_RETURN_QUANTITY_DECIMALS = 3;
export const SUPPLIER_RETURN_REASON_MAX = 2000;
