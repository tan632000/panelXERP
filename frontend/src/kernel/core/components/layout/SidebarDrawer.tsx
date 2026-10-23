"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import {
  resolvePinnedEntries,
  searchSidebarNav,
  type SidebarNavGroup,
} from "@/kernel/core/components/layout/sidebar-nav";
import {
  SidebarHeading,
  SidebarPinButton,
  SidebarPinnedList,
  SidebarSearchField,
  SidebarSearchResults,
} from "@/kernel/core/components/layout/SidebarParts";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";
import { Link } from "@/kernel/i18n/navigation";

export interface SidebarDrawerProps {
  groups: SidebarNavGroup[];
  pins: readonly string[];
  onTogglePin: (href: string) => void;
  brandLogo: React.ReactNode;
  brandName: string;
  onClose?: () => void;
}

/**
 * The phone and tablet navigation: pinned functions, then every module as a row whose
 * functions open in place beneath it, one module at a time. It opens on the module of the
 * current screen, so its siblings are one tap away.
 */
export function SidebarDrawer({
  groups,
  pins,
  onTogglePin,
  brandLogo,
  brandName,
  onClose,
}: SidebarDrawerProps) {
  const t = useTranslations("common");
  const [openKey, setOpenKey] = useState<string | null>(
    () => groups.find((group) => group.active)?.key ?? null,
  );
  const [query, setQuery] = useState("");

  const pinned = useMemo(
    () => resolvePinnedEntries(groups, pins),
    [groups, pins],
  );
  const hits = useMemo(() => searchSidebarNav(groups, query), [groups, query]);
  const isSearching = query.trim().length > 0;

  return (
    <aside className="flex h-full w-[min(320px,85vw)] flex-col bg-brand text-white shadow-[8px_0_28px_rgba(15,23,42,0.3)]">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/10 pl-4 pr-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-sm font-extrabold text-brand">
          {brandLogo}
        </span>
        <span className="min-w-0 flex-1 truncate text-base font-semibold">
          {brandName}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("closeMenu")}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-white/85 hover:bg-white/10"
        >
          <Icon name="x" size={22} />
        </button>
      </div>

      <div className="flex shrink-0 px-4 pb-1 pt-3">
        <SidebarSearchField
          value={query}
          onChange={setQuery}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.stopPropagation();
              setQuery("");
            }
          }}
        />
      </div>

      <nav
        aria-label={t("sidebarModules")}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-4"
      >
        {isSearching ? (
          <SidebarSearchResults
            query={query}
            hits={hits}
            onNavigate={onClose}
          />
        ) : (
          <>
            {/* The pinned block appears only once something is pinned. */}
            {pinned.length > 0 && (
              <>
                <SidebarHeading icon="pin">{t("sidebarPinned")}</SidebarHeading>
                <SidebarPinnedList entries={pinned} onNavigate={onClose} />
                <div className="mx-5 mb-0.5 mt-2.5 h-px bg-white/10" />
              </>
            )}
            <SidebarHeading>{t("sidebarModules")}</SidebarHeading>
            {groups.map((group) => {
              const isOpen = openKey === group.key;
              return (
                <div key={group.key}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenKey(isOpen ? null : group.key)}
                    className={cn(
                      "mx-2 flex min-h-11 w-[calc(100%-16px)] cursor-pointer items-center gap-3 rounded-[10px] border-0 px-3 text-left text-[15px] [font-family:inherit]",
                      isOpen
                        ? "bg-white/10 font-semibold text-white"
                        : "bg-transparent font-medium text-white/90 hover:bg-white/10",
                    )}
                  >
                    <Icon name={group.icon} size={20} className="shrink-0" />
                    <span className="min-w-0">{group.title}</span>
                    {group.active && (
                      <span
                        className="size-[7px] shrink-0 rounded-full bg-sky-300"
                        aria-label={t("sidebarCurrentModule")}
                      />
                    )}
                    <Icon
                      name="chevron-down"
                      size={18}
                      className={cn(
                        "ml-auto shrink-0 text-white/60 transition-transform duration-150",
                        isOpen && "rotate-180 text-white",
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="mb-2 ml-[31px] mr-2 mt-0.5 flex flex-col gap-px border-l border-white/15 pl-2.5">
                      {group.items.map((entry) => (
                        <div
                          key={entry.href}
                          className={cn(
                            "flex items-center rounded-[10px] pl-3",
                            entry.active
                              ? "bg-white text-brand"
                              : "text-white/85 hover:bg-white/10",
                          )}
                        >
                          <Link
                            href={entry.href}
                            onClick={onClose}
                            className={cn(
                              "flex min-h-11 min-w-0 flex-1 items-center text-[15px] text-inherit no-underline",
                              entry.active && "font-semibold",
                            )}
                          >
                            {entry.label}
                          </Link>
                          <SidebarPinButton
                            entry={entry}
                            pinned={pins.includes(entry.href)}
                            onToggle={onTogglePin}
                            tone={entry.active ? "light" : "dark"}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </nav>
    </aside>
  );
}
