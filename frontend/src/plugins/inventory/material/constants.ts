export const materialPageRoutes = {
  list: "/inventory/materials",
  order: (orderId: number | string) => `/inventory/materials/${orderId}`,
} as const;

export const materialApiRoutes = {
  orders: "/inventory/materials/orders",
  order: (orderId: number | string) => `/inventory/materials/orders/${orderId}`,
  estimateVsActual: (orderId: number | string) =>
    `/inventory/materials/orders/${orderId}/estimate-vs-actual`,
} as const;

export const materialQueryKeys = {
  all: ["materials"] as const,
  orders: (filters?: Record<string, unknown>) =>
    [...materialQueryKeys.all, "orders", filters] as const,
  order: (orderId: number) =>
    [...materialQueryKeys.all, "order", orderId] as const,
  estimateVsActual: (orderId: number) =>
    [...materialQueryKeys.all, "estimate-vs-actual", orderId] as const,
};
