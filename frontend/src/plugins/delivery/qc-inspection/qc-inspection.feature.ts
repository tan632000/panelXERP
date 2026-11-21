import { QcInspectionPermission } from "@plugins/delivery/qc-inspection/permissions/qc-inspection-permission.keys";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/** Listed before the checklist template so a QC inspector's menu opens on the cabinets to inspect. */
export const qcInspectionFeature: ErpFrontendFeature = {
  key: "qc-inspection",
  plugin: "delivery",
  sectionTitle: "sidebarDelivery",
  items: [
    {
      featureKey: "qc-inspection",
      href: "/delivery/qc",
      icon: "clipboard-list",
      label: "qcMenu",
      activeMatch: ["/delivery/qc/units"],
      permissions: [QcInspectionPermission.read, "qc_inspection:*"],
    },
    {
      featureKey: "qc-inspection",
      href: "/delivery/qc/defects",
      icon: "alert",
      label: "defectsMenu",
      permissions: [QcInspectionPermission.read, "qc_inspection:*"],
    },
  ],
};
