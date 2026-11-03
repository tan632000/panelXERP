export const ISSUE_SEVERITIES = ["low", "medium", "high"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_STATUSES = ["open", "resolved"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/** Longest description and resolution the server takes. */
export const ISSUE_TEXT_MAX = 2000;

export const issuePageRoutes = {
  list: "/production/issues",
} as const;

export const issueApiRoutes = {
  list: "/production/issues",
  open: (unitId: number | string) => `/production/units/${unitId}/issues`,
  resolve: (id: number | string) => `/production/issues/${id}/resolve`,
} as const;

export const issueQueryKeys = {
  all: ["production-issues"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...issueQueryKeys.all, "list", filters] as const,
};
