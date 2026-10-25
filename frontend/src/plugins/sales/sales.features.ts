import { estimateFeature } from "@plugins/sales/estimate/estimate.feature";
import { orderFeature } from "@plugins/sales/order/order.feature";
import { quotationFeature } from "@plugins/sales/quotation/quotation.feature";
import { requestFeature } from "@plugins/sales/request/request.feature";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/** Sales feature catalog. */
export const SALES_FRONTEND_FEATURES: ErpFrontendFeature[] = [
  requestFeature,
  estimateFeature,
  quotationFeature,
  orderFeature,
];
