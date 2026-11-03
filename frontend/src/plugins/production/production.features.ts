import { productionIssueFeature } from "@plugins/production/production-issue/production-issue.feature";
import { productionOrderFeature } from "@plugins/production/production-order/production-order.feature";
import { progressFeature } from "@plugins/production/progress/progress.feature";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/** Production feature catalog; the progress entry comes first so it opens the menu. */
export const PRODUCTION_FRONTEND_FEATURES: ErpFrontendFeature[] = [
  progressFeature,
  productionOrderFeature,
  productionIssueFeature,
];
