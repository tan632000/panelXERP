export const PRODUCTION_ISSUE_READ = 'production_issue:read' as const;
export const PRODUCTION_ISSUE_CREATE = 'production_issue:create' as const;
/** Close an issue with a resolution: production managers. */
export const PRODUCTION_ISSUE_RESOLVE = 'production_issue:resolve' as const;

export const productionIssuePermissions = [
  PRODUCTION_ISSUE_READ,
  PRODUCTION_ISSUE_CREATE,
  PRODUCTION_ISSUE_RESOLVE,
] as const;
