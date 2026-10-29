import { STOCK_RECEIPT_READ } from "@plugins/inventory/receipt/permissions/receipt.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const receiptFeature: ErpFrontendFeature = {
  key: "receipt",
  plugin: "inventory",
  sectionTitle: "sidebarInventory",
  items: [
    {
      featureKey: "receipt",
      href: "/inventory/receipts",
      icon: "package-import",
      label: "receipts",
      permissions: [STOCK_RECEIPT_READ, "stock_receipt:*"],
    },
  ],
};
