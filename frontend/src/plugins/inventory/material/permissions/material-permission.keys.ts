/**
 * Material permission keys — keep in sync with backend material.permissions.ts.
 *
 * Gate every material control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const MaterialPermission = {
  read: "material:read",
} as const;

export type MaterialPermissionKey =
  (typeof MaterialPermission)[keyof typeof MaterialPermission];
