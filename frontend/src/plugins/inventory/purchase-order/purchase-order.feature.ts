import { PURCHASE_ORDER_READ } from "@plugins/inventory/purchase-order/permissions/purchase-order.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const purchaseOrderFeature: ErpFrontendFeature = {
  key: "purchase-order",
  plugin: "inventory",
  sectionTitle: "sidebarInventory",
  items: [
    {
      featureKey: "purchase-order",
      href: "/inventory/purchase-orders",
      icon: "file-invoice",
      label: "purchaseOrders",
      permissions: [PURCHASE_ORDER_READ, "purchase_order:*"],
      // A return to the supplier is opened from its purchase order.
      activeMatch: ["/inventory/supplier-returns"],
    },
  ],
};
