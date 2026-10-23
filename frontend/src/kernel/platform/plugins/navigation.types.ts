export interface SidebarItemConfig {
  href: string;
  icon: string;
  label: string;
  key?: string;
  /** Feature slice key — filtered by ENABLED_FEATURES */
  featureKey?: string;
  permissions?: string[];
  /**
   * Route-permission mapping only — never rendered in the sidebar itself. For a feature
   * reached exclusively through another screen (a tab, a picker) but still resolvable at its
   * own URL, this is what lets `findNavigationItem` grant page access without adding a link no
   * one should click directly.
   */
  hidden?: boolean;
  /**
   * Further route prefixes that light this entry up. For one menu entry fronting several
   * screens — a hub whose tabs keep their own URLs — so the entry stays marked on every tab.
   */
  activeMatch?: readonly string[];
}

export interface SidebarSection {
  title?: string;
  items: SidebarItemConfig[];
  /**
   * i18n namespace holding this section's title and item labels. The sidebar shows every
   * module at once, so a section's labels are not resolved in the current module's namespace.
   * A module key doubles as its namespace.
   */
  namespace?: string;
}

export interface ModuleNavigation {
  moduleName: string;
  sections: SidebarSection[];
}
