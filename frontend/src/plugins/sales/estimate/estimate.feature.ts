import { ESTIMATE_READ } from "@plugins/sales/estimate/permissions/estimate.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const estimateFeature: ErpFrontendFeature = {
  key: "estimate",
  plugin: "sales",
  sectionTitle: "sidebarSales",
  items: [
    {
      featureKey: "estimate",
      href: "/sales/estimates",
      icon: "calculator",
      label: "estimates",
      permissions: [ESTIMATE_READ, "estimate:*"],
    },
  ],
};
