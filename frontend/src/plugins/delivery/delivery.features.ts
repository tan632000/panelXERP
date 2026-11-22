import { deliveryNoteFeature } from "@plugins/delivery/delivery-note/delivery-note.feature";
import { installationFeature } from "@plugins/delivery/installation/installation.feature";
import { qcChecklistFeature } from "@plugins/delivery/qc-checklist/qc-checklist.feature";
import { qcInspectionFeature } from "@plugins/delivery/qc-inspection/qc-inspection.feature";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/** Delivery feature catalog; a feature left out of the enabled keys loses its menu entry. */
export const DELIVERY_FRONTEND_FEATURES: ErpFrontendFeature[] = [
  qcInspectionFeature,
  qcChecklistFeature,
  deliveryNoteFeature,
  installationFeature,
];
