import { QUOTATION_READ } from "@plugins/sales/quotation/permissions/quotation.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const quotationFeature: ErpFrontendFeature = {
  key: "quotation",
  plugin: "sales",
  sectionTitle: "sidebarSales",
  items: [
    {
      featureKey: "quotation",
      href: "/sales/quotations",
      icon: "file-invoice",
      label: "quotations",
      permissions: [QUOTATION_READ, "quotation:*"],
    },
  ],
};
