export const stocktakePageRoutes = {
  list: "/inventory/stocktakes",
  detail: (id: number | string) => `/inventory/stocktakes/${id}`,
} as const;

export type StocktakeAction = "submit" | "approve" | "reject" | "cancel";

export const stocktakeApiRoutes = {
  list: "/inventory/stocktakes",
  detail: (id: number | string) => `/inventory/stocktakes/${id}`,
  scan: (id: number | string) => `/inventory/stocktakes/${id}/scan`,
  line: (id: number | string, itemId: number | string) =>
    `/inventory/stocktakes/${id}/lines/${itemId}`,
  action: (id: number | string, action: StocktakeAction) =>
    `/inventory/stocktakes/${id}/${action}`,
  locations: "/catalog/locations",
} as const;

export const stocktakeQueryKeys = {
  all: ["stocktakes"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...stocktakeQueryKeys.all, "list", filters] as const,
  detail: (id: number) => [...stocktakeQueryKeys.all, "detail", id] as const,
  locations: ["stocktakes", "locations"] as const,
};

export const STOCKTAKE_STATUSES = [
  "counting",
  "submitted",
  "approved",
  "cancelled",
] as const;
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number];

export const STOCKTAKE_QUANTITY_DECIMALS = 3;
export const STOCKTAKE_REASON_MAX = 2000;
