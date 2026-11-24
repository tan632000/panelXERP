import { TemplatePermission } from "@plugins/sales/template/permissions/template-permission.keys";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const templateFeature: ErpFrontendFeature = {
  key: "template",
  plugin: "sales",
  sectionTitle: "sidebarSales",
  items: [
    {
      featureKey: "template",
      href: "/sales/templates",
      icon: "file-description",
      label: "templates",
      permissions: [TemplatePermission.read, "quotation_template:*"],
    },
  ],
};
