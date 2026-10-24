import { ITEM_READ } from "@plugins/catalog/item/permissions/item.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const itemFeature: ErpFrontendFeature = {
  key: "item",
  plugin: "catalog",
  sectionTitle: "sidebarCatalog",
  items: [
    {
      featureKey: "item",
      href: "/catalog/items",
      icon: "tag",
      label: "items",
      permissions: [ITEM_READ, "item:*"],
    },
  ],
};
