import { STOCKTAKE_READ } from "@plugins/inventory/stocktake/permissions/stocktake.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const stocktakeFeature: ErpFrontendFeature = {
  key: "stocktake",
  plugin: "inventory",
  sectionTitle: "sidebarInventory",
  items: [
    {
      featureKey: "stocktake",
      href: "/inventory/stocktakes",
      icon: "clipboard-list",
      label: "stocktakes",
      permissions: [STOCKTAKE_READ, "stocktake:*"],
    },
  ],
};
