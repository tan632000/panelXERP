/**
 * The sidebar's view of the navigation: one group per section (a module), each with its
 * visible entries, plus the helpers the desktop rail and the phone drawer share.
 */

import { foldSearchText } from "@/kernel/core/lib/search-text";

/** Sections reached elsewhere (the user menu) rather than from the sidebar. */
export const SIDEBAR_EXCLUDED_SECTIONS: readonly string[] = ["sidebarSystem"];

/** One icon per module, keyed by section title; a section not listed uses its first item's. */
export const SECTION_ICONS: Readonly<Record<string, string>> = {
  sectionMasterData: "database",
  sidebarSales: "shopping-cart",
  sidebarOtherRevenue: "currency-dollar",
  sidebarProcurement: "clipboard-list",
  sidebarWarehouse: "building-warehouse",
  sidebarPlans: "calendar",
  sidebarProduction: "building-factory",
  sidebarDelivery: "truck",
  sidebarQcLab: "shield-check",
  sidebarMaintenance: "tool",
  sectionReports: "chart-bar",
};

/** `common` keys for the labels too long for the collapsed rail's narrow tiles. */
export const SECTION_SHORT_TITLE_KEYS: Readonly<Record<string, string>> = {
  sidebarOtherRevenue: "sidebarShortOtherRevenue",
  sidebarMaintenance: "sidebarShortMaintenance",
};

export interface SidebarNavEntry {
  /** The entry's route; also the identity a pin is stored under. */
  href: string;
  label: string;
  active: boolean;
  groupKey: string;
  groupTitle: string;
}

export interface SidebarNavGroup {
  key: string;
  title: string;
  shortTitle: string;
  icon: string;
  /** Holds the entry of the current screen. */
  active: boolean;
  items: SidebarNavEntry[];
}

export interface SidebarSearchHit {
  entry: SidebarNavEntry;
  /** The label split around the matched run, so it can be highlighted. */
  before: string;
  match: string;
  after: string;
}

/** Every entry whose label contains the query, in sidebar order. */
export function searchSidebarNav(
  groups: readonly SidebarNavGroup[],
  query: string,
): SidebarSearchHit[] {
  const needle = foldSearchText(query.trim());
  if (!needle) return [];

  return groups.flatMap((group) =>
    group.items.flatMap((entry) => {
      const at = foldSearchText(entry.label).indexOf(needle);
      if (at < 0) return [];
      const chars = Array.from(entry.label);
      return [
        {
          entry,
          before: chars.slice(0, at).join(""),
          match: chars.slice(at, at + needle.length).join(""),
          after: chars.slice(at + needle.length).join(""),
        },
      ];
    }),
  );
}

/** The pinned entries that still exist for this user, in the order they were pinned. */
export function resolvePinnedEntries(
  groups: readonly SidebarNavGroup[],
  pinnedHrefs: readonly string[],
): SidebarNavEntry[] {
  const byHref = new Map(
    groups.flatMap((group) => group.items.map((item) => [item.href, item])),
  );
  return pinnedHrefs.flatMap((href) => {
    const entry = byHref.get(href);
    return entry ? [entry] : [];
  });
}
