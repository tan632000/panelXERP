/** Business code prefix — codes read `DA_0001`. */
export const PROJECT_CODE_PREFIX = "DA_";

export const projectPageRoutes = {
  list: "/crm/projects",
} as const;

export const projectApiRoutes = {
  list: "/projects",
  bulkDelete: "/projects/bulk-delete",
  columnValues: "/projects/column-values",
  nextCode: "/projects/next-code",
  detail: (id: number | string) => `/projects/${id}`,
} as const;

/** Module key the list-preference endpoint stores the project list column choice under. */
export const PROJECT_LIST_PREFERENCE_KEY = "project_list_v2";

export const projectQueryKeys = {
  all: ["projects"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...projectQueryKeys.all, "list", filters] as const,
  detail: (id: number | string) => [...projectQueryKeys.all, id] as const,
  nextCode: () => [...projectQueryKeys.all, "next-code"] as const,
};
