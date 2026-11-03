export const productionOrderPageRoutes = {
  list: "/production/orders",
  /** The list narrowed to the production orders of one sales order. */
  forOrder: (orderId: number | string) =>
    `/production/orders?orderId=${orderId}`,
  detail: (id: number | string) => `/production/orders/${id}`,
} as const;

export const productionOrderApiRoutes = {
  list: "/production/orders",
  detail: (id: number | string) => `/production/orders/${id}`,
  unit: (id: number | string, unitId: number | string) =>
    `/production/orders/${id}/units/${unitId}`,
  shortage: (id: number | string) => `/production/orders/${id}/shortage`,
  release: (id: number | string) => `/production/orders/${id}/release`,
  cancel: (id: number | string) => `/production/orders/${id}/cancel`,
  technicianOptions: "/production/technician-options",
  openOrders: "/production/open-orders",
} as const;

export const productionOrderQueryKeys = {
  all: ["production-orders"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...productionOrderQueryKeys.all, "list", filters] as const,
  detail: (id: number) =>
    [...productionOrderQueryKeys.all, "detail", id] as const,
  shortage: (id: number) =>
    [...productionOrderQueryKeys.all, "shortage", id] as const,
  technicians: ["production-orders", "technicians"] as const,
  openOrders: ["production-orders", "open-orders"] as const,
};

export const PRODUCTION_ORDER_STATUSES = [
  "draft",
  "released",
  "completed",
  "cancelled",
] as const;
export type ProductionOrderStatus = (typeof PRODUCTION_ORDER_STATUSES)[number];

/** A draft or released order may still change who builds a cabinet and by when. */
export const PRODUCTION_ORDER_EDITABLE_STATUSES: readonly ProductionOrderStatus[] =
  ["draft", "released"];

export const PRODUCTION_REASON_MAX = 1000;

/** The planned end dates a cabinet takes; the API refuses a year outside 2000-2999. */
export const PLANNED_END_DATE_MIN = "2000-01-01";
export const PLANNED_END_DATE_MAX = "2999-12-31";
