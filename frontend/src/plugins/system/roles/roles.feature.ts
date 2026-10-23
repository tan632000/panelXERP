import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const systemRolesFeature: ErpFrontendFeature = {
  key: "system-roles",
  plugin: "system",
  sectionTitle: "sidebarSystem",
  items: [
    {
      featureKey: "system-roles",
      href: "/system/roles",
      icon: "shield-check",
      label: "rolePermissions",
      permissions: ["*:*"],
    },
  ],
};
