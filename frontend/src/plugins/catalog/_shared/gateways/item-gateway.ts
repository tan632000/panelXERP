import { itemQueryKeys } from "@plugins/catalog/item/constants";
import { getItems } from "@plugins/catalog/item/services/item.service";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type { Item } from "@plugins/catalog/item/types";

/** How other plugins page through the catalog items they let a user pick from. */
export function fetchItemPickerPage(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<PaginatedResponse<Item>> {
  return getItems(params);
}

/** Query key of an item picker's search, under the items key so catalog edits refresh it. */
export function itemPickerQueryKey(search: string) {
  return [...itemQueryKeys.all, "picker", search] as const;
}
