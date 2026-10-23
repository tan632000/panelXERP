import type { ModuleNavigation } from "../../platform/plugins/navigation.types";

export const {name}Navigation: ModuleNavigation = {
  moduleName: "moduleName",
  sections: [
    {
      title: "sectionOverview",
      items: [
        {
          href: "/{name}",
          icon: "file-text",
          label: "overview",
          permissions: ["{name}:read", "{name}:*"],
        },
      ],
    },
  ],
};
