/**
 * Contact permission keys — keep in sync with backend contact.permissions.ts.
 *
 * Gate every contact control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const ContactPermission = {
  read: "contact:read",
  create: "contact:create",
  update: "contact:update",
  delete: "contact:delete",
} as const;

export type ContactPermissionKey =
  (typeof ContactPermission)[keyof typeof ContactPermission];
