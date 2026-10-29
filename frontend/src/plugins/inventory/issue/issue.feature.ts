import { STOCK_ISSUE_READ } from "@plugins/inventory/issue/permissions/issue.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const issueFeature: ErpFrontendFeature = {
  key: "issue",
  plugin: "inventory",
  sectionTitle: "sidebarInventory",
  items: [
    {
      featureKey: "issue",
      href: "/inventory/issues",
      icon: "package-export",
      label: "issues",
      permissions: [STOCK_ISSUE_READ, "stock_issue:*"],
    },
  ],
};
