export const purchaseRequestPageRoutes = {
  list: "/inventory/purchase-requests",
} as const;

export const purchaseRequestApiRoutes = {
  list: "/inventory/purchase-requests",
  fromOrder: (orderId: number | string) =>
    `/inventory/purchase-requests/from-order/${orderId}`,
  cancel: (id: number | string) => `/inventory/purchase-requests/${id}/cancel`,
  toPurchaseOrder: "/inventory/purchase-orders/from-requests",
  suppliers: "/inventory/suppliers",
  /** The catalog's scan lookup: an active item by barcode, else by code. */
  resolveItem: "/items/resolve",
} as const;

export const purchaseRequestQueryKeys = {
  all: ["purchase-requests"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...purchaseRequestQueryKeys.all, "list", filters] as const,
  suppliers: ["purchase-requests", "suppliers"] as const,
};

export const PURCHASE_REQUEST_QUANTITY_DECIMALS = 3;
