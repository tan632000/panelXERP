import { ProductionProgressPermission } from "@plugins/production/progress/permissions/progress-permission.keys";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/** Placed before the production orders so a technician's menu opens on their own cabinets. */
export const progressFeature: ErpFrontendFeature = {
  key: "progress",
  plugin: "production",
  sectionTitle: "sidebarProduction",
  items: [
    {
      featureKey: "progress",
      href: "/production/my-units",
      icon: "building-factory",
      label: "myUnits",
      activeMatch: ["/production/units"],
      permissions: [
        ProductionProgressPermission.update,
        "production_progress:*",
      ],
    },
    {
      // Reached from a cabinet code or a row of the own-cabinets list; without an entry the module shell
      // answers a cabinet page with a 403 for everyone but an administrator.
      featureKey: "progress",
      href: "/production/units",
      icon: "building-factory",
      label: "unitTitle",
      permissions: [ProductionProgressPermission.read, "production_progress:*"],
      hidden: true,
    },
  ],
};
