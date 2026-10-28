export const locationPageRoutes = {
  list: "/catalog/locations",
} as const;

export const locationApiRoutes = {
  list: "/catalog/locations",
  bulkDelete: "/catalog/locations/bulk-delete",
  columnValues: "/catalog/locations/column-values",
  detail: (id: number | string) => `/catalog/locations/${id}`,
} as const;

/** Module key the list-preference endpoint stores the location list column choice under. */
export const LOCATION_LIST_PREFERENCE_KEY = "location_list_v2";

export const locationQueryKeys = {
  all: ["locations"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...locationQueryKeys.all, "list", filters] as const,
};
