export const STOCK_ISSUE_READ = 'stock_issue:read' as const;
/** Issue materials to an open order. */
export const STOCK_ISSUE_CREATE = 'stock_issue:create' as const;
export const STOCK_RETURN_READ = 'stock_return:read' as const;
/** Take back what the workshop did not use. */
export const STOCK_RETURN_CREATE = 'stock_return:create' as const;

export const stockIssuePermissions = [
  STOCK_ISSUE_READ,
  STOCK_ISSUE_CREATE,
  STOCK_RETURN_READ,
  STOCK_RETURN_CREATE,
] as const;
