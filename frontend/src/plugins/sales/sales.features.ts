import { requestFeature } from "@plugins/sales/request/request.feature";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/** Sales feature catalog. */
export const SALES_FRONTEND_FEATURES: ErpFrontendFeature[] = [requestFeature];
