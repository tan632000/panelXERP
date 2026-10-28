/**
 * Purchase order permission keys — keep in sync with backend purchase-order.permissions.ts.
 *
 * Gate every purchase order control on one of these instead of a literal string, so a scope
 * rename shows up as a type error rather than a control that silently stops matching.
 */
export const PurchaseOrderPermission = {
  read: "purchase_order:read",
  create: "purchase_order:create",
  update: "purchase_order:update",
  submit: "purchase_order:submit",
  approve: "purchase_order:approve",
  cancel: "purchase_order:cancel",
  close: "purchase_order:close",
} as const;

export type PurchaseOrderPermissionKey =
  (typeof PurchaseOrderPermission)[keyof typeof PurchaseOrderPermission];
