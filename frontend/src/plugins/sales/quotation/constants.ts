/** Status of one quotation version; values match the API enum. Only a draft is editable. */
export const QUOTATION_VERSION_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "customer_confirmed",
  "cancelled",
  "closed",
] as const;
export type QuotationVersionStatus =
  (typeof QUOTATION_VERSION_STATUSES)[number];

/** How a discount value reads; values match the API enum. */
export const DISCOUNT_TYPES = ["percent", "amount"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** The VAT rates a quotation may carry, in percent. */
export const VAT_RATES = [0, 5, 8, 10] as const;
export type VatRate = (typeof VAT_RATES)[number];
export const DEFAULT_VAT_RATE: VatRate = 8;

/** Bounds the server enforces too. */
export const MARGIN_MAX_PERCENT = 1000;
export const DISCOUNT_MAX_PERCENT = 100;
/** Margin and discount are typed to the hundredth of a percent / of a dong. */
export const PERCENT_DECIMALS = 2;
export const MONEY_DECIMALS = 2;

/** Request state a quotation is started from. */
export const QUOTATION_REQUEST_STARTABLE_STATUS = "estimated" as const;

export const quotationPageRoutes = {
  list: "/sales/quotations",
  detail: (id: number | string) => `/sales/quotations/${id}`,
} as const;

export const quotationApiRoutes = {
  list: "/sales/quotations",
  detail: (id: number | string) => `/sales/quotations/${id}`,
} as const;

export const quotationQueryKeys = {
  all: ["sales-quotations"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...quotationQueryKeys.all, "list", filters] as const,
  detail: (id: number | string, ver?: number) =>
    [...quotationQueryKeys.all, id, ver ?? "latest"] as const,
  detailAll: (id: number | string) => [...quotationQueryKeys.all, id] as const,
  ofRequest: (requestId: number | string) =>
    [...quotationQueryKeys.all, "request", requestId] as const,
};
