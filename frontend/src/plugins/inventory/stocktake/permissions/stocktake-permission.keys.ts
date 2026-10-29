/**
 * Stock count permission keys — keep in sync with backend stocktake.permissions.ts.
 *
 * Gate every count control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const StocktakePermission = {
  read: "stocktake:read",
  create: "stocktake:create",
  update: "stocktake:update",
  submit: "stocktake:submit",
  approve: "stocktake:approve",
  cancel: "stocktake:cancel",
} as const;

export type StocktakePermissionKey =
  (typeof StocktakePermission)[keyof typeof StocktakePermission];
