export const contactApiRoutes = {
  list: "/contacts",
  detail: (id: number | string) => `/contacts/${id}`,
} as const;

/** One customer's contacts fit one page; the API caps a page at 100. */
export const CONTACT_LIST_LIMIT = 100;

export const contactQueryKeys = {
  all: ["contacts"] as const,
  list: (customerId: number) =>
    [...contactQueryKeys.all, "list", customerId] as const,
};
