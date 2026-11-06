/** Status of an estimate in a list: that of its latest revision. Values match the API enum. */
export const ESTIMATE_LIST_STATUSES = ["draft", "submitted"] as const;
export type EstimateListStatus = (typeof ESTIMATE_LIST_STATUSES)[number];

/** Status of one revision. Only a draft is editable. */
export const REVISION_STATUSES = ["draft", "submitted", "superseded"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

/** What a per-panel cost line pays for besides the BOM materials; values match the API enum. */
export const COST_CATEGORIES = [
  "design",
  "labor",
  "installation",
  "transport",
  "other",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

/** Request states in which an estimate can still be started or revised. */
export const ESTIMATE_REQUEST_STARTABLE_STATUS = "assigned" as const;

/** Field limits the server enforces too. */
export const ESTIMATE_TAG_MAX = 50;
export const ESTIMATE_DESCRIPTION_MAX = 500;
export const ESTIMATE_NOTE_MAX = 500;
export const ESTIMATE_PANEL_QUANTITY_MAX = 10_000;
export const ESTIMATE_BOM_QUANTITY_MAX = 1_000_000;
export const ESTIMATE_UNIT_COST_MAX = 10_000_000_000;
export const ESTIMATE_COST_AMOUNT_MAX = 1_000_000_000_000;
/** Decimals the BOM grid accepts: quantity to the gram, cost to the cent. */
export const BOM_QUANTITY_DECIMALS = 3;
export const MONEY_DECIMALS = 2;

export const estimatePageRoutes = {
  list: "/sales/estimates",
  detail: (id: number | string) => `/sales/estimates/${id}`,
} as const;

export const estimateApiRoutes = {
  list: "/sales/estimates",
  detail: (id: number | string) => `/sales/estimates/${id}`,
  submit: (id: number | string) => `/sales/estimates/${id}/submit`,
  revise: (id: number | string) => `/sales/estimates/${id}/revise`,
  panels: (id: number | string) => `/sales/estimates/${id}/panels`,
  panel: (id: number | string, panelId: number | string) =>
    `/sales/estimates/${id}/panels/${panelId}`,
  bomLines: (id: number | string, panelId: number | string) =>
    `/sales/estimates/${id}/panels/${panelId}/bom-lines`,
  bomLine: (id: number | string, lineId: number | string) =>
    `/sales/estimates/${id}/bom-lines/${lineId}`,
  unitCost: (id: number | string, lineId: number | string) =>
    `/sales/estimates/${id}/bom-lines/${lineId}/unit-cost`,
  price: (id: number | string) => `/sales/estimates/${id}/price`,
  costLines: (id: number | string, panelId: number | string) =>
    `/sales/estimates/${id}/panels/${panelId}/cost-lines`,
  costLine: (id: number | string, lineId: number | string) =>
    `/sales/estimates/${id}/cost-lines/${lineId}`,
} as const;

export const estimateQueryKeys = {
  all: ["sales-estimates"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...estimateQueryKeys.all, "list", filters] as const,
  detail: (id: number | string, revision?: number) =>
    [...estimateQueryKeys.all, id, revision ?? "latest"] as const,
  detailAll: (id: number | string) => [...estimateQueryKeys.all, id] as const,
  ofRequest: (requestId: number | string) =>
    [...estimateQueryKeys.all, "request", requestId] as const,
};
