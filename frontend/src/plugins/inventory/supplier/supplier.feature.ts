import { SUPPLIER_READ } from "@plugins/inventory/supplier/permissions/supplier.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const supplierFeature: ErpFrontendFeature = {
  key: "supplier",
  plugin: "inventory",
  sectionTitle: "sidebarInventory",
  items: [
    {
      featureKey: "supplier",
      href: "/inventory/suppliers",
      icon: "truck",
      label: "suppliers",
      permissions: [SUPPLIER_READ, "supplier:*"],
    },
  ],
};
