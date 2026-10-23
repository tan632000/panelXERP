export const systemRoleApiRoutes = {
  list: "/roles",
  permissionCatalog: "/roles/permissions",
  permissions: (id: number) => `/roles/${id}/permissions`,
} as const;

/** Registered in the backend's list-preference key list; the gear column needs it. */
export const ROLE_LIST_PREFERENCE_KEY = "role_list_v2";

export const systemRoleQueryKeys = {
  all: ["system-roles"] as const,
  list: () => ["system-roles", "list"] as const,
  catalog: () => ["system-roles", "catalog"] as const,
};

/** The role that holds it owns every function, so it is never an assignable checkbox. */
export const WILDCARD_PERMISSION = "*:*";
