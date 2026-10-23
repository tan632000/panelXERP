"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import {
  SECTION_ICONS,
  SECTION_SHORT_TITLE_KEYS,
  SIDEBAR_EXCLUDED_SECTIONS,
  type SidebarNavGroup,
} from "@/kernel/core/components/layout/sidebar-nav";
import { usePathname } from "@/kernel/i18n/navigation";
import { appNavigationSections } from "@/kernel/platform/plugins/navigation.registry";

import type {
  SidebarItemConfig,
  SidebarSection,
} from "@/kernel/platform/plugins/navigation.types";

/**
 * The modules the signed-in user can open, each with the entries they hold permission for,
 * labelled in the current locale and marked against the current route.
 */
export function useSidebarNav(
  moduleKey: string | undefined,
  sections: SidebarSection[] | undefined,
): SidebarNavGroup[] {
  const pathname = usePathname();
  const { can } = useAuth();
  // Sections come from several modules, each naming its own namespace, so their labels are
  // resolved from the root of the message tree rather than the current module's namespace.
  const tRoot = useTranslations();
  const tModule = useTranslations(moduleKey || "common");
  const tCommon = useTranslations("common");

  return useMemo(() => {
    const label = (section: SidebarSection, key: string) =>
      (section.namespace
        ? tRoot(`${section.namespace}.${key}`)
        : tModule(key)
      ).replace(/\s+/g, " ");
    const isActive = (item: SidebarItemConfig) =>
      [item.href, ...(item.activeMatch ?? [])].some(
        (href) => pathname === href || pathname.startsWith(`${href}/`),
      );

    return (sections ?? appNavigationSections)
      .filter(
        (section) => !SIDEBAR_EXCLUDED_SECTIONS.includes(section.title ?? ""),
      )
      .map((section, index) => {
        const visible = section.items.filter(
          (item) =>
            !item.hidden &&
            (!item.permissions?.length ||
              item.permissions.some((perm) => can(perm))),
        );
        const key = section.title ?? `section-${index}`;
        const title = section.title ? label(section, section.title) : "";
        const shortKey = section.title
          ? SECTION_SHORT_TITLE_KEYS[section.title]
          : undefined;
        const items = visible.map((item) => ({
          href: item.href,
          label: label(section, item.label),
          active: isActive(item),
          groupKey: key,
          groupTitle: title,
        }));
        return {
          key,
          title,
          shortTitle: shortKey ? tCommon(shortKey) : title,
          icon: SECTION_ICONS[section.title ?? ""] ?? visible[0]?.icon ?? "box",
          active: items.some((item) => item.active),
          items,
        };
      })
      .filter((group) => group.items.length > 0);
  }, [sections, pathname, can, tRoot, tModule, tCommon]);
}
