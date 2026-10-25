import { OrderPermission } from "@plugins/sales/order/permissions/order.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const orderFeature: ErpFrontendFeature = {
  key: "order",
  plugin: "sales",
  sectionTitle: "sidebarSales",
  items: [
    {
      featureKey: "order",
      href: "/sales/orders",
      icon: "clipboard-list",
      label: "orders",
      permissions: [OrderPermission.read, "order:*"],
    },
  ],
};
