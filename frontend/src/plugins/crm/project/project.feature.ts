import { PROJECT_READ } from "@plugins/crm/project/permissions/project.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const projectFeature: ErpFrontendFeature = {
  key: "project",
  plugin: "crm",
  dependsOn: ["customer"],
  sectionTitle: "sidebarCrm",
  items: [
    {
      featureKey: "project",
      href: "/crm/projects",
      icon: "building",
      label: "projects",
      permissions: [PROJECT_READ, "project:*"],
    },
  ],
};
