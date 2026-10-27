export const supplierPageRoutes = {
  list: "/inventory/suppliers",
} as const;

export const supplierApiRoutes = {
  list: "/inventory/suppliers",
  bulkDelete: "/inventory/suppliers/bulk-delete",
  columnValues: "/inventory/suppliers/column-values",
  detail: (id: number | string) => `/inventory/suppliers/${id}`,
} as const;

/** Module key the list-preference endpoint stores the supplier list column choice under. */
export const SUPPLIER_LIST_PREFERENCE_KEY = "supplier_list_v2";

export const supplierQueryKeys = {
  all: ["suppliers"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...supplierQueryKeys.all, "list", filters] as const,
};
