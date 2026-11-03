import { ProductionIssuePermission } from "@plugins/production/production-issue/permissions/production-issue-permission.keys";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const productionIssueFeature: ErpFrontendFeature = {
  key: "production-issue",
  plugin: "production",
  sectionTitle: "sidebarProduction",
  items: [
    {
      featureKey: "production-issue",
      href: "/production/issues",
      icon: "alert-triangle",
      label: "issuesMenu",
      permissions: [ProductionIssuePermission.read, "production_issue:*"],
    },
  ],
};
