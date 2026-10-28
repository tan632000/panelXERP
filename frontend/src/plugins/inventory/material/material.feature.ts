import { MATERIAL_READ } from "@plugins/inventory/material/permissions/material.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const materialFeature: ErpFrontendFeature = {
  key: "material",
  plugin: "inventory",
  sectionTitle: "sidebarInventory",
  items: [
    {
      featureKey: "material",
      href: "/inventory/materials",
      icon: "package",
      label: "materials",
      permissions: [MATERIAL_READ, "material:*"],
    },
  ],
};
