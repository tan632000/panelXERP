import { PURCHASE_REQUEST_READ } from "@plugins/inventory/purchase-request/permissions/purchase-request.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const purchaseRequestFeature: ErpFrontendFeature = {
  key: "purchase-request",
  plugin: "inventory",
  sectionTitle: "sidebarInventory",
  items: [
    {
      featureKey: "purchase-request",
      href: "/inventory/purchase-requests",
      icon: "clipboard-list",
      label: "purchaseRequests",
      permissions: [PURCHASE_REQUEST_READ, "purchase_request:*"],
    },
  ],
};
