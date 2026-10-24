/**
 * Project permission keys — keep in sync with backend project.permissions.ts.
 *
 * Gate every project control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const ProjectPermission = {
  read: "project:read",
  create: "project:create",
  update: "project:update",
  delete: "project:delete",
} as const;

export type ProjectPermissionKey =
  (typeof ProjectPermission)[keyof typeof ProjectPermission];
