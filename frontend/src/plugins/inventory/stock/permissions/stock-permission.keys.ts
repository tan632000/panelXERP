/**
 * Stock permission keys — keep in sync with backend stock.permissions.ts.
 *
 * Gate every stock control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const StockPermission = {
  availability: "stock:availability",
  read: "stock:read",
  ledger: "stock:ledger",
} as const;

export type StockPermissionKey =
  (typeof StockPermission)[keyof typeof StockPermission];
