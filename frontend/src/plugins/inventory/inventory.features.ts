import { supplierFeature } from "@plugins/inventory/supplier/supplier.feature";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/** Inventory feature catalog. */
export const INVENTORY_FRONTEND_FEATURES: ErpFrontendFeature[] = [
  supplierFeature,
];
