/**
 * Request permission keys — keep in sync with backend request.permissions.ts.
 *
 * Gate every request control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const RequestPermission = {
  read: "request:read",
  create: "request:create",
  update: "request:update",
  assign: "request:assign",
  cancel: "request:cancel",
} as const;

export type RequestPermissionKey =
  (typeof RequestPermission)[keyof typeof RequestPermission];
