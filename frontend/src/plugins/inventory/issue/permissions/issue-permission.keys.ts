/**
 * Stock issue and workshop return permission keys — keep in sync with backend
 * issue.permissions.ts.
 *
 * Gate every issue or return control on one of these instead of a literal string, so a scope
 * rename shows up as a type error rather than a control that silently stops matching.
 */
export const IssuePermission = {
  read: "stock_issue:read",
  create: "stock_issue:create",
  returnRead: "stock_return:read",
  returnCreate: "stock_return:create",
} as const;

export type IssuePermissionKey =
  (typeof IssuePermission)[keyof typeof IssuePermission];
