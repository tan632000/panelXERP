import { LOCATION_READ } from "@plugins/catalog/location/permissions/location.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const locationFeature: ErpFrontendFeature = {
  key: "location",
  plugin: "catalog",
  sectionTitle: "sidebarCatalog",
  items: [
    {
      featureKey: "location",
      href: "/catalog/locations",
      icon: "map-pin",
      label: "locations",
      permissions: [LOCATION_READ, "location:*"],
    },
  ],
};
