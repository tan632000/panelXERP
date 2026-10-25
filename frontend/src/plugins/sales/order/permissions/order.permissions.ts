/**
 * Order permission keys — keep in sync with backend order.permissions.ts.
 *
 * Gate every order control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const OrderPermission = {
  read: "order:read",
  create: "order:create",
  update: "order:update",
  cancel: "order:cancel",
} as const;

export type OrderPermissionKey =
  (typeof OrderPermission)[keyof typeof OrderPermission];
