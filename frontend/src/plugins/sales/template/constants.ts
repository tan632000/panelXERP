/** Business code prefix — codes read `TPL_0001`. */
export const TEMPLATE_CODE_PREFIX = "TPL_";

export const templatePageRoutes = {
  list: "/sales/templates",
} as const;

export const templateApiRoutes = {
  list: "/sales/quotation-templates",
  detail: (id: number | string) => `/sales/quotation-templates/${id}`,
  activate: (id: number | string) =>
    `/sales/quotation-templates/${id}/activate`,
  deactivate: (id: number | string) =>
    `/sales/quotation-templates/${id}/deactivate`,
} as const;

export const templateQueryKeys = {
  all: ["quotation-templates"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...templateQueryKeys.all, "list", filters] as const,
  detail: (id: number | string) => [...templateQueryKeys.all, id] as const,
};
