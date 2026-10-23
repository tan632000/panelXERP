export const queryKeys = {
  health: ["health"] as const,
  auth: {
    me: ["auth", "me"] as const,
  },
  /** Distinct values of one filterable list column, per endpoint, search term, and scope. */
  columnValues: (
    endpoint: string,
    column: string,
    search: string,
    scope?: string,
  ) => ["column-values", endpoint, column, search, scope] as const,
  /** The signed-in account's column choice for one list screen. */
  listColumnPreference: (moduleKey: string) =>
    ["list-column-preference", moduleKey] as const,
} as const;
