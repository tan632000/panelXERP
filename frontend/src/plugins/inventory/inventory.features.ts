import { issueFeature } from "@plugins/inventory/issue/issue.feature";
import { materialFeature } from "@plugins/inventory/material/material.feature";
import { purchaseOrderFeature } from "@plugins/inventory/purchase-order/purchase-order.feature";
import { purchaseRequestFeature } from "@plugins/inventory/purchase-request/purchase-request.feature";
import { receiptFeature } from "@plugins/inventory/receipt/receipt.feature";
import { stockFeature } from "@plugins/inventory/stock/stock.feature";
import { stocktakeFeature } from "@plugins/inventory/stocktake/stocktake.feature";
import { supplierFeature } from "@plugins/inventory/supplier/supplier.feature";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/** Inventory feature catalog. */
export const INVENTORY_FRONTEND_FEATURES: ErpFrontendFeature[] = [
  supplierFeature,
  stockFeature,
  purchaseOrderFeature,
  receiptFeature,
  issueFeature,
  stocktakeFeature,
  purchaseRequestFeature,
  materialFeature,
];
