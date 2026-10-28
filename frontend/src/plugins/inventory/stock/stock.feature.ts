import { STOCK_READ } from "@plugins/inventory/stock/permissions/stock.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const stockFeature: ErpFrontendFeature = {
  key: "stock",
  plugin: "inventory",
  sectionTitle: "sidebarInventory",
  items: [
    {
      featureKey: "stock",
      href: "/inventory/stock",
      icon: "building-warehouse",
      label: "stock",
      permissions: [STOCK_READ, "stock:*"],
    },
  ],
};
