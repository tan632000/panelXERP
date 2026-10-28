import { itemFeature } from "@plugins/catalog/item/item.feature";
import { locationFeature } from "@plugins/catalog/location/location.feature";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/** Catalog feature catalog. */
export const CATALOG_FRONTEND_FEATURES: ErpFrontendFeature[] = [
  itemFeature,
  locationFeature,
];
