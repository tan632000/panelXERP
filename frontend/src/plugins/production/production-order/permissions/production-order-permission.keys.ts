/**
 * Production order permission keys — keep in sync with backend production-order.permissions.ts.
 *
 * Gate every production order control on one of these instead of a literal string, so a scope
 * rename shows up as a type error rather than a control that silently stops matching.
 */
export const ProductionOrderPermission = {
  read: "production_order:read",
  create: "production_order:create",
  update: "production_order:update",
  release: "production_order:release",
  cancel: "production_order:cancel",
} as const;

export type ProductionOrderPermissionKey =
  (typeof ProductionOrderPermission)[keyof typeof ProductionOrderPermission];
