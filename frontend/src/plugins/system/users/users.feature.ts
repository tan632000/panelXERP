import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const systemUsersFeature: ErpFrontendFeature = {
  key: "system-users",
  plugin: "system",
  sectionTitle: "sidebarSystem",
  items: [
    {
      featureKey: "system-users",
      href: "/system/users",
      icon: "users",
      label: "userManagement",
      permissions: ["*:*"],
    },
  ],
};
