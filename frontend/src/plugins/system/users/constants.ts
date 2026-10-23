export const adminUserApiRoutes = {
  list: "/users",
  detail: (id: number) => `/users/${id}`,
  active: (id: number) => `/users/${id}/active`,
  roles: "/users/roles",
  columnValues: "/users/column-values",
  bulkDeactivate: "/users/bulk-deactivate",
  bulkDelete: "/users/bulk-delete",
  bulkApproveSignatures: "/users/signatures/bulk-approve",
  import: "/users/import",
  export: "/users/export",
  approveSignature: (id: number) => `/users/${id}/signature/approve`,
  rejectSignature: (id: number) => `/users/${id}/signature/reject`,
} as const;

/** Registered in the backend's list-preference key list; the gear column needs it. */
export const USER_LIST_PREFERENCE_KEY = "user_list_v2";

export const adminUserQueryKeys = {
  all: ["admin-users"] as const,
  list: (params: Record<string, unknown>) =>
    ["admin-users", "list", params] as const,
  roles: () => ["admin-users", "roles"] as const,
  detail: (id: number) => ["admin-users", "detail", id] as const,
};

/** The search parameter a signature-review notification opens this list with. */
export const SIGNATURE_REVIEW_PARAM = "signatureReview";

/** Mirrors the backend column, so the field stops before the server refuses it. */
export const SIGNATURE_REJECTION_REASON_MAX_LENGTH = 500;

/**
 * Excel export and import of the account list (Function List 1.9, admin only) — their own
 * scopes, mirroring the backend `user-permission.constant.ts`, so the permission matrix can
 * show them. Full system access holds both through the wildcard.
 */
export const USER_IMPORT = "user:import" as const;
export const USER_EXPORT = "user:export" as const;
