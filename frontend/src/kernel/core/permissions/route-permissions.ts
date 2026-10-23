import { navigationConfig } from "@/kernel/platform/plugins/navigation.registry";

import type { SidebarItemConfig } from "@/kernel/platform/plugins/navigation.types";

const LOCALE_PREFIX_RE = /^\/(vi|en)(?=\/|$)/;

export function normalizeModulePath(pathname: string): string {
  const withoutLocale = pathname.replace(LOCALE_PREFIX_RE, "") || "/";
  return withoutLocale.length > 1
    ? withoutLocale.replace(/\/$/, "")
    : withoutLocale;
}

export function findNavigationItem(
  moduleKey: string,
  pathname: string,
): SidebarItemConfig | null {
  const sections = navigationConfig[moduleKey]?.sections ?? [];
  const normalizedPath = normalizeModulePath(pathname);
  const items = sections.flatMap((section) => section.items);
  return (
    items
      .filter(
        (item) =>
          normalizedPath === item.href ||
          normalizedPath.startsWith(`${item.href}/`),
      )
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}
