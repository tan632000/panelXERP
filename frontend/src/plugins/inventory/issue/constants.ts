export const issuePageRoutes = {
  list: "/inventory/issues",
  /** The issue screen of one order. */
  issue: (orderId: number | string) => `/inventory/issues/new?orderId=${orderId}`,
  /** The workshop return screen of one order. */
  workshopReturn: (orderId: number | string) =>
    `/inventory/issues/return?orderId=${orderId}`,
} as const;

export const issueApiRoutes = {
  issues: "/inventory/issues",
  workshopReturns: "/inventory/workshop-returns",
  /** The catalog's scan lookup: an active item by barcode, else by code. */
  resolveItem: "/items/resolve",
} as const;

export const issueQueryKeys = {
  all: ["stock-issues"] as const,
  issues: (filters?: Record<string, unknown>) =>
    [...issueQueryKeys.all, "issues", filters] as const,
};

export const ISSUE_QUANTITY_DECIMALS = 3;
export const ISSUE_REASON_MAX = 2000;
