/** Status of a sales order; values match the API enum. P1 reaches `open` and `cancelled`. */
export const ORDER_STATUSES = [
  "open",
  "in_production",
  "delivered",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Bounds the server enforces too. */
export const REASON_MAX = 1000;
export const CONTRACT_NO_MAX = 100;

export const orderPageRoutes = {
  list: "/sales/orders",
  detail: (id: number | string) => `/sales/orders/${id}`,
} as const;

export const orderApiRoutes = {
  list: "/sales/orders",
  detail: (id: number | string) => `/sales/orders/${id}`,
  cancel: (id: number | string) => `/sales/orders/${id}/cancel`,
} as const;

export const orderQueryKeys = {
  all: ["sales-orders"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...orderQueryKeys.all, "list", filters] as const,
  detail: (id: number | string) => [...orderQueryKeys.all, id] as const,
  ofQuotation: (quotationId: number | string) =>
    [...orderQueryKeys.all, "quotation", quotationId] as const,
};
