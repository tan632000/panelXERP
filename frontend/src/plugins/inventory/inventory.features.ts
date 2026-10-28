import { purchaseOrderFeature } from "@plugins/inventory/purchase-order/purchase-order.feature";
import { stockFeature } from "@plugins/inventory/stock/stock.feature";
import { supplierFeature } from "@plugins/inventory/supplier/supplier.feature";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/** Inventory feature catalog. */
export const INVENTORY_FRONTEND_FEATURES: ErpFrontendFeature[] = [
  supplierFeature,
  stockFeature,
  purchaseOrderFeature,
];
