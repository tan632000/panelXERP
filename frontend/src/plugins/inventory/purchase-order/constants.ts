export const purchaseOrderPageRoutes = {
  list: "/inventory/purchase-orders",
  create: "/inventory/purchase-orders/new",
  detail: (id: number | string) => `/inventory/purchase-orders/${id}`,
} as const;

export type PurchaseOrderAction =
  "submit" | "approve" | "reject" | "cancel" | "close";

export const purchaseOrderApiRoutes = {
  list: "/inventory/purchase-orders",
  detail: (id: number | string) => `/inventory/purchase-orders/${id}`,
  action: (id: number | string, action: PurchaseOrderAction) =>
    `/inventory/purchase-orders/${id}/${action}`,
} as const;

export const purchaseOrderQueryKeys = {
  all: ["purchase-orders"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...purchaseOrderQueryKeys.all, "list", filters] as const,
  detail: (id: number) =>
    [...purchaseOrderQueryKeys.all, "detail", id] as const,
};

export const PURCHASE_ORDER_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "partially_received",
  "received",
  "closed",
  "cancelled",
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_VAT_RATES = [0, 5, 8, 10] as const;

/** Statuses a cancel may leave, while nothing has been received. */
export const PURCHASE_ORDER_CANCELLABLE: readonly PurchaseOrderStatus[] = [
  "draft",
  "pending_approval",
  "approved",
];
/** Statuses a short-close may leave. */
export const PURCHASE_ORDER_CLOSABLE: readonly PurchaseOrderStatus[] = [
  "approved",
  "partially_received",
];

/** Statuses goods may still be received on. */
export const PURCHASE_ORDER_RECEIVABLE: readonly PurchaseOrderStatus[] = [
  "approved",
  "partially_received",
];

export const PURCHASE_ORDER_REASON_MAX = 1000;
export const PURCHASE_ORDER_NOTE_MAX = 2000;
export const PURCHASE_ORDER_QUANTITY_DECIMALS = 3;
