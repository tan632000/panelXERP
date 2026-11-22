import { InstallationPermission } from "@plugins/delivery/installation/permissions/installation-permission.keys";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const installationFeature: ErpFrontendFeature = {
  key: "installation",
  plugin: "delivery",
  sectionTitle: "sidebarDelivery",
  items: [
    {
      featureKey: "installation",
      href: "/delivery/installations",
      icon: "tool",
      label: "installationMenu",
      permissions: [InstallationPermission.read, "installation:*"],
    },
  ],
};
