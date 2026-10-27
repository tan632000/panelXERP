/**
 * Supplier permission keys — keep in sync with backend supplier.permissions.ts.
 *
 * Gate every supplier control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const SupplierPermission = {
  read: "supplier:read",
  create: "supplier:create",
  update: "supplier:update",
  delete: "supplier:delete",
} as const;

export type SupplierPermissionKey =
  (typeof SupplierPermission)[keyof typeof SupplierPermission];
