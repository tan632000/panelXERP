/** Business code prefix — codes read `KH_0001`. */
export const CUSTOMER_CODE_PREFIX = "KH_";

export const customerPageRoutes = {
  list: "/crm/customers",
  detail: (id: number | string) => `/crm/customers/${id}`,
} as const;

export const customerApiRoutes = {
  list: "/customers",
  bulkDelete: "/customers/bulk-delete",
  columnValues: "/customers/column-values",
  nextCode: "/customers/next-code",
  ownerOptions: "/customers/owner-options",
  detail: (id: number | string) => `/customers/${id}`,
} as const;

/** Module key the list-preference endpoint stores the customer list column choice under. */
export const CUSTOMER_LIST_PREFERENCE_KEY = "customer_list_v2";

export const customerQueryKeys = {
  all: ["customers"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...customerQueryKeys.all, "list", filters] as const,
  detail: (id: number | string) => [...customerQueryKeys.all, id] as const,
  nextCode: () => [...customerQueryKeys.all, "next-code"] as const,
  ownerOptions: () => [...customerQueryKeys.all, "owner-options"] as const,
};
