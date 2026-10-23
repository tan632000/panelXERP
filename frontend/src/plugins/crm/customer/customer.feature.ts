import { CUSTOMER_READ } from "@plugins/crm/customer/permissions/customer.permissions";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const customerFeature: ErpFrontendFeature = {
  key: "customer",
  plugin: "crm",
  sectionTitle: "sidebarCrm",
  items: [
    {
      featureKey: "customer",
      href: "/crm/customers",
      icon: "users",
      label: "customers",
      permissions: [CUSTOMER_READ, "customer:*"],
    },
  ],
};
