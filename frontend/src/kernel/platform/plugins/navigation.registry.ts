import { ENABLED_FRONTEND_PLUGINS } from "@kernel/platform/plugins/enabled-plugins";
import { futureNavigation } from "@kernel/platform/plugins/future-navigation";

import type {
  ModuleNavigation,
  SidebarSection,
} from "@kernel/platform/plugins/navigation.types";

function mergeModuleNavigation(
  base: ModuleNavigation,
  contribution: ModuleNavigation,
): ModuleNavigation {
  const sections = [...base.sections];

  for (const contribSection of contribution.sections) {
    const matchIndex = sections.findIndex(
      (section) => section.title === contribSection.title,
    );

    if (matchIndex >= 0) {
      sections[matchIndex] = {
        ...sections[matchIndex],
        items: [...sections[matchIndex].items, ...contribSection.items],
      };
    } else {
      sections.push(contribSection);
    }
  }

  return {
    moduleName: base.moduleName || contribution.moduleName,
    sections,
  };
}

/**
 * Aggregates navigation from all enabled plugins, merging sections
 * by navigationModuleKey. Then overlays future (stub) entries.
 */
export const navigationConfig: Record<string, ModuleNavigation> = (() => {
  const pluginNav = ENABLED_FRONTEND_PLUGINS.reduce<
    Record<string, ModuleNavigation>
  >((acc, plugin) => {
    const key = plugin.navigationModuleKey;
    const existing = acc[key];
    acc[key] = existing
      ? mergeModuleNavigation(existing, plugin.navigation)
      : plugin.navigation;
    return acc;
  }, {});

  return {
    ...futureNavigation,
    ...pluginNav,
  };
})();

/**
 * Section order the sidebar renders. Feature tasks add their section title here when they
 * register a plugin; a section not listed is appended after these, in module-registration order.
 */
const SECTION_ORDER: string[] = ["sidebarCrm", "sidebarCatalog"];

/**
 * Every module's sections in one list, each tagged with the namespace its labels live in.
 * The sidebar renders the whole application, as the mock does, and hides what the signed-in
 * user has no permission for.
 */
export const appNavigationSections: SidebarSection[] = (() => {
  const tagged = Object.entries(navigationConfig).flatMap(
    ([moduleKey, module]) =>
      module.sections.map((section) => ({
        ...section,
        namespace: section.namespace ?? moduleKey,
      })),
  );

  const rank = (section: SidebarSection) => {
    const index = SECTION_ORDER.indexOf(section.title ?? "");
    return index === -1 ? SECTION_ORDER.length : index;
  };

  return tagged
    .map((section, index) => ({ section, index }))
    .sort((a, b) => rank(a.section) - rank(b.section) || a.index - b.index)
    .map(({ section }) => section);
})();
