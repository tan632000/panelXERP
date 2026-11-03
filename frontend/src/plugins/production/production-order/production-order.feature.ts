import { PRODUCTION_ORDER_READ } from "@plugins/production/production-order/permissions/production-order.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const productionOrderFeature: ErpFrontendFeature = {
  key: "production-order",
  plugin: "production",
  sectionTitle: "sidebarProduction",
  items: [
    {
      featureKey: "production-order",
      href: "/production/orders",
      icon: "building-factory",
      label: "orders",
      permissions: [PRODUCTION_ORDER_READ, "production_order:*"],
    },
  ],
};
