/**
 * Purchase request permission keys — keep in sync with backend purchase-request.permissions.ts.
 *
 * Gate every request control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const PurchaseRequestPermission = {
  read: "purchase_request:read",
  create: "purchase_request:create",
  update: "purchase_request:update",
  cancel: "purchase_request:cancel",
} as const;

export type PurchaseRequestPermissionKey =
  (typeof PurchaseRequestPermission)[keyof typeof PurchaseRequestPermission];
