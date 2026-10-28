export const stockApiRoutes = {
  list: "/inventory/stock",
  movements: (itemId: number | string) => `/inventory/stock/${itemId}/movements`,
} as const;

/** Rows one ledger page shows in the drawer. */
export const STOCK_LEDGER_PAGE_SIZE = 20;

export const stockQueryKeys = {
  all: ["stock"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...stockQueryKeys.all, "list", filters] as const,
  movements: (itemId: number, page: number) =>
    [...stockQueryKeys.all, "movements", itemId, page] as const,
};
