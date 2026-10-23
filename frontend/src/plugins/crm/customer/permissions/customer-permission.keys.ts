/**
 * Customer permission keys — keep in sync with backend customer.permissions.ts.
 *
 * Gate every customer control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const CustomerPermission = {
  read: "customer:read",
  create: "customer:create",
  update: "customer:update",
  delete: "customer:delete",
} as const;

export type CustomerPermissionKey =
  (typeof CustomerPermission)[keyof typeof CustomerPermission];
