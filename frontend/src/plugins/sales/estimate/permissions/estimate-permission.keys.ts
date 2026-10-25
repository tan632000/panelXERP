/**
 * Estimate permission keys — keep in sync with backend estimate.permissions.ts.
 *
 * Gate every estimate control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const EstimatePermission = {
  read: "estimate:read",
  create: "estimate:create",
  update: "estimate:update",
  submit: "estimate:submit",
} as const;

export type EstimatePermissionKey =
  (typeof EstimatePermission)[keyof typeof EstimatePermission];
