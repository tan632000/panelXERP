/**
 * Production issue permission keys — keep in sync with backend production-issue.permissions.ts.
 */
export const ProductionIssuePermission = {
  read: "production_issue:read",
  create: "production_issue:create",
  resolve: "production_issue:resolve",
} as const;
