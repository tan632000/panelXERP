import { qcChecklistFeature } from "@plugins/delivery/qc-checklist/qc-checklist.feature";
import { qcInspectionFeature } from "@plugins/delivery/qc-inspection/qc-inspection.feature";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/** Delivery feature catalog; a feature left out of the enabled keys loses its menu entry. */
export const DELIVERY_FRONTEND_FEATURES: ErpFrontendFeature[] = [
  qcInspectionFeature,
  qcChecklistFeature,
];
