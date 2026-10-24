/** Item groups, in the order the select lists them; values match the API enum. */
export const ITEM_GROUPS = [
  "enclosure",
  "breaker",
  "contactor",
  "relay",
  "plc",
  "inverter",
  "cable",
  "terminal",
  "accessory",
  "other",
] as const;

export type ItemGroup = (typeof ITEM_GROUPS)[number];

export const ITEM_CODE_MAX = 64;
export const ITEM_UNIT_MAX = 20;
/** Largest import the dialog accepts; the server enforces the same limit. */
export const ITEM_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export const itemPageRoutes = {
  list: "/catalog/items",
} as const;

export const itemApiRoutes = {
  list: "/items",
  bulkDelete: "/items/bulk-delete",
  columnValues: "/items/column-values",
  import: "/items/import",
  importTemplate: "/items/import-template",
  detail: (id: number | string) => `/items/${id}`,
} as const;

/** Module key the list-preference endpoint stores the item list column choice under. */
export const ITEM_LIST_PREFERENCE_KEY = "item_list_v2";

export const itemQueryKeys = {
  all: ["items"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...itemQueryKeys.all, "list", filters] as const,
  detail: (id: number | string) => [...itemQueryKeys.all, id] as const,
};
