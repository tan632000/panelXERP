import { SIDEBAR_EXCLUDED_SECTIONS } from "@/kernel/core/components/layout/sidebar-nav";
import { appNavigationSections } from "@/kernel/platform/plugins/navigation.registry";

import type { SidebarSection } from "@/kernel/platform/plugins/navigation.types";

/** Every signed-in user may open their own profile, so it is the landing of last resort. */
export const LANDING_FALLBACK_PATH = "/profile";

/**
 * The first screen the signed-in user may open, in sidebar order. Sections the sidebar leaves
 * out (system administration) are only tried after every sidebar section.
 */
export function getLandingPath(
  can: (permission: string) => boolean,
  sections: SidebarSection[] = appNavigationSections,
): string {
  const isExcluded = (section: SidebarSection) =>
    SIDEBAR_EXCLUDED_SECTIONS.includes(section.title ?? "");
  const ordered = [
    ...sections.filter((section) => !isExcluded(section)),
    ...sections.filter(isExcluded),
  ];

  for (const section of ordered) {
    const item = section.items.find(
      (entry) =>
        !entry.hidden &&
        (!entry.permissions?.length ||
          entry.permissions.some((perm) => can(perm))),
    );
    if (item) return item.href;
  }

  return LANDING_FALLBACK_PATH;
}
