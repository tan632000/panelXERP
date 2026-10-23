import type {
  SidebarItemConfig,
  SidebarSection,
} from "@kernel/platform/plugins/navigation.types";

/** One optional feature slice inside a frontend plugin */
export interface ErpFrontendFeature {
  key: string;
  plugin: string;
  dependsOn?: readonly string[];
  /** Nav section title key (i18n) */
  sectionTitle?: string;
  items: SidebarItemConfig[];
}

export interface ModuleNavigationSlice {
  moduleName: string;
  sections: SidebarSection[];
}
