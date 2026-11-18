import { QcChecklistPermission } from "@plugins/delivery/qc-checklist/permissions/qc-checklist-permission.keys";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const qcChecklistFeature: ErpFrontendFeature = {
  key: "qc-checklist",
  plugin: "delivery",
  sectionTitle: "sidebarDelivery",
  items: [
    {
      featureKey: "qc-checklist",
      href: "/delivery/qc/checklist",
      icon: "clipboard-list",
      label: "checklistMenu",
      permissions: [QcChecklistPermission.read, "qc_checklist:*"],
    },
  ],
};
