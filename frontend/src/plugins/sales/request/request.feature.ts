import { REQUEST_READ } from "@plugins/sales/request/permissions/request.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const requestFeature: ErpFrontendFeature = {
  key: "request",
  plugin: "sales",
  sectionTitle: "sidebarSales",
  items: [
    {
      featureKey: "request",
      href: "/sales/requests",
      icon: "file-text",
      label: "requests",
      permissions: [REQUEST_READ, "request:*"],
    },
  ],
};
