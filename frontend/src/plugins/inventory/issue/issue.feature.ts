import {
  STOCK_ISSUE_READ,
  STOCK_RETURN_CREATE,
} from "@plugins/inventory/issue/permissions/issue.permissions";

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
    {
      // Reached only from a purchase order's "return to supplier" action; without an entry
      // the module shell answers its URL with a 403 for everyone but an administrator.
      featureKey: "issue",
      href: "/inventory/supplier-returns",
      icon: "truck-return",
      label: "supplierReturns",
      permissions: [STOCK_RETURN_CREATE, "stock_return:*"],
      hidden: true,
    },
  ],
};
