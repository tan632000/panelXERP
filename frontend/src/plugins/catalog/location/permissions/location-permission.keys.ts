/**
 * Location permission keys — keep in sync with backend location.permissions.ts.
 *
 * Gate every location control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const LocationPermission = {
  read: "location:read",
  create: "location:create",
  update: "location:update",
  delete: "location:delete",
} as const;

export type LocationPermissionKey =
  (typeof LocationPermission)[keyof typeof LocationPermission];
