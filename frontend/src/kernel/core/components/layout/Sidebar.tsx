"use client";

import { useTranslations } from "next-intl";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { BrandLogo } from "@/kernel/core/components/layout/BrandLogo";
import {
  resolvePinnedEntries,
  searchSidebarNav,
  type SidebarNavGroup,
} from "@/kernel/core/components/layout/sidebar-nav";
import { SidebarDrawer } from "@/kernel/core/components/layout/SidebarDrawer";
import { SidebarFlyout } from "@/kernel/core/components/layout/SidebarFlyout";
import {
  SidebarHeading,
  SidebarPinnedList,
  SidebarSearchField,
  SidebarSearchResults,
} from "@/kernel/core/components/layout/SidebarParts";
import { useSidebarCollapsed } from "@/kernel/core/components/layout/use-sidebar-collapsed";
import { useSidebarNav } from "@/kernel/core/components/layout/use-sidebar-nav";
import { useSidebarPins } from "@/kernel/core/components/layout/use-sidebar-pins";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { appConfig } from "@/kernel/core/config/app.config";
import { cn } from "@/kernel/core/lib/cn";
import { usePathname } from "@/kernel/i18n/navigation";

import type { SidebarSection } from "@/kernel/platform/plugins/navigation.types";

export interface SidebarProps {
  brandLogo?: React.ReactNode;
  brandName?: string;
  moduleKey?: string;
  sections?: SidebarSection[];
  footer?: React.ReactNode;
  username?: string;
  /** Kept for callers; the sidebar no longer shows pending counts. */
  badges?: Record<string, number>;
  /**
   * Renders the phone and tablet drawer instead of the desktop rail: modules expand in place
   * and a close button replaces the collapse toggle.
   */
  drawer?: boolean;
  /** Closes the drawer; only read when `drawer` is set. */
  onClose?: () => void;
}

/** Grace period for the pointer to cross from a module row to its flyout. */
const FLYOUT_CLOSE_DELAY_MS = 180;
const FLYOUT_GAP = 8;

interface OpenFlyout {
  key: string;
  anchorTop: number;
  left: number;
  /** The route it opened on; navigating away closes it without an effect. */
  path: string;
}

/** Colour of a collapsed-rail tile: the current module, the one whose flyout is open, or neither. */
function railTileTone(active: boolean, open: boolean): string {
  if (active) return "bg-white font-bold text-brand";
  if (open) return "bg-white/15 font-medium text-white";
  return "bg-transparent font-medium text-white/75 hover:bg-white/10 hover:text-white";
}

/** Colour of an expanded module row: its flyout open, the current module, or neither. */
function moduleRowTone(active: boolean, open: boolean): string {
  if (open) return "bg-white/15 text-white";
  if (active) return "bg-transparent text-white hover:bg-white/10";
  return "bg-transparent text-white/85 hover:bg-white/10 hover:text-white";
}

export function Sidebar({
  brandLogo = <BrandLogo />,
  brandName = appConfig.name,
  moduleKey,
  sections,
  footer,
  drawer = false,
  onClose,
}: SidebarProps) {
  const { user } = useAuth();
  const groups = useSidebarNav(moduleKey, sections);
  const { pins, togglePin } = useSidebarPins(user?.id);

  if (drawer) {
    return (
      <SidebarDrawer
        groups={groups}
        pins={pins}
        onTogglePin={togglePin}
        brandLogo={brandLogo}
        brandName={brandName}
        onClose={onClose}
      />
    );
  }

  return (
    <DesktopSidebar
      groups={groups}
      pins={pins}
      onTogglePin={togglePin}
      brandLogo={brandLogo}
      brandName={brandName}
      footer={footer}
    />
  );
}

interface DesktopSidebarProps {
  groups: SidebarNavGroup[];
  pins: readonly string[];
  onTogglePin: (href: string) => void;
  brandLogo: React.ReactNode;
  brandName: string;
  footer?: React.ReactNode;
}

/**
 * The desktop navigation: a navy sidebar listing pinned functions and the modules, each
 * module opening its functions in a flyout on hover or click. It collapses to an 80px rail
 * of module tiles that open the same flyout.
 */
function DesktopSidebar({
  groups,
  pins,
  onTogglePin,
  brandLogo,
  brandName,
  footer,
}: DesktopSidebarProps) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [flyout, setFlyout] = useState<OpenFlyout | null>(null);
  const [query, setQuery] = useState("");
  const asideRef = useRef<HTMLElement | null>(null);
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openFlyout = flyout?.path === pathname ? flyout : null;
  const openGroup = openFlyout
    ? groups.find((group) => group.key === openFlyout.key)
    : undefined;
  const pinned = useMemo(
    () => resolvePinnedEntries(groups, pins),
    [groups, pins],
  );
  const hits = useMemo(() => searchSidebarNav(groups, query), [groups, query]);
  const isSearching = !collapsed && query.trim().length > 0;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const closeFlyout = () => {
    cancelClose();
    setFlyout(null);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(
      () => setFlyout(null),
      FLYOUT_CLOSE_DELAY_MS,
    );
  };
  const showFlyout = (group: SidebarNavGroup, row: HTMLElement) => {
    cancelClose();
    setFlyout({
      key: group.key,
      anchorTop: row.getBoundingClientRect().top,
      left: (asideRef.current?.getBoundingClientRect().right ?? 0) + FLYOUT_GAP,
      path: pathname,
    });
  };

  useEffect(() => cancelClose, []);

  // A click anywhere outside the sidebar and its flyout, or Escape, closes the flyout.
  useEffect(() => {
    if (!openFlyout) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (asideRef.current?.contains(target)) return;
      if (flyoutRef.current?.contains(target)) return;
      setFlyout(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFlyout(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openFlyout]);

  // Ctrl+K / Cmd+K jumps to the function search, expanding the rail first.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        !(event.ctrlKey || event.metaKey)
      ) {
        return;
      }
      // The rail is mounted but hidden below `lg`, where the drawer navigates instead.
      if (!asideRef.current?.offsetParent) return;
      event.preventDefault();
      setCollapsed(false);
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCollapsed]);

  const isModuleOpen = (group: SidebarNavGroup) =>
    openFlyout?.key === group.key;
  const onModuleClick = (
    group: SidebarNavGroup,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (isModuleOpen(group)) closeFlyout();
    else showFlyout(group, event.currentTarget);
  };
  // Hover opens for a mouse only: a tap would open it here and close it again on click.
  const onModulePointerEnter = (
    group: SidebarNavGroup,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.pointerType === "mouse") showFlyout(group, event.currentTarget);
  };
  // Leaving the module row closes the flyout, after a grace period to reach it — staying
  // inside the sidebar must not keep it open.
  const onModulePointerLeave = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.pointerType === "mouse" && openFlyout) scheduleClose();
  };

  return (
    <>
      {/* `h-dvh`, not `h-screen`: on an iPad or a small laptop the browser's own bars eat into
          `100vh`, which pushed the collapse button below the visible edge. */}
      <aside
        ref={asideRef}
        className={cn(
          "flex h-dvh shrink-0 flex-col bg-brand text-white transition-[width] duration-200 ease-in-out",
          collapsed
            ? "w-[length:var(--sidebar-width-collapsed,80px)]"
            : "w-[length:var(--sidebar-width)]",
        )}
      >
        <div
          className={cn(
            "box-border flex h-[length:var(--app-header-height)] shrink-0 items-center gap-2.5 border-b border-white/10",
            collapsed ? "justify-center" : "px-[18px]",
          )}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center bg-white font-extrabold text-brand",
              collapsed
                ? "size-10 rounded-xl text-[15px]"
                : "size-9 rounded-[10px] text-sm",
            )}
          >
            {brandLogo}
          </span>
          {!collapsed && (
            <span className="min-w-0 truncate text-[15px] font-semibold">
              {brandName}
            </span>
          )}
        </div>

        {collapsed ? (
          <nav
            aria-label={t("sidebarModules")}
            className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto overflow-x-hidden py-2.5"
          >
            {groups.map((group) => {
              const isOpen = isModuleOpen(group);
              return (
                <button
                  key={group.key}
                  type="button"
                  title={group.title}
                  aria-expanded={isOpen}
                  aria-haspopup="menu"
                  onClick={(event) => onModuleClick(group, event)}
                  onPointerEnter={(event) => onModulePointerEnter(group, event)}
                  onPointerLeave={onModulePointerLeave}
                  className={cn(
                    "mx-auto flex h-[54px] w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-0 p-0 text-center text-[10.5px] leading-tight [font-family:inherit]",
                    railTileTone(group.active, isOpen),
                  )}
                >
                  <Icon name={group.icon} size={20} />
                  <span className="line-clamp-2 max-w-full break-words px-0.5">
                    {group.shortTitle}
                  </span>
                </button>
              );
            })}
          </nav>
        ) : (
          <>
            <div className="relative flex shrink-0 px-3.5 pb-2 pt-3.5">
              <SidebarSearchField
                inputRef={searchRef}
                value={query}
                onChange={setQuery}
                onFocus={closeFlyout}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("");
                }}
              />
              {!query && (
                <kbd className="pointer-events-none absolute right-[22px] top-1/2 mt-[3px] -translate-y-1/2 rounded-[5px] border border-white/20 px-1.5 py-px font-sans text-[11px] font-semibold text-white/70">
                  Ctrl K
                </kbd>
              )}
            </div>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2">
              {isSearching ? (
                <SidebarSearchResults
                  query={query}
                  hits={hits}
                  onNavigate={() => setQuery("")}
                />
              ) : (
                <>
                  {/* The pinned block appears only once something is pinned. */}
                  {pinned.length > 0 && (
                    <>
                      <SidebarHeading icon="pin">
                        {t("sidebarPinned")}
                      </SidebarHeading>
                      <SidebarPinnedList entries={pinned} />
                      <div className="mx-[18px] mb-1 mt-3 h-px bg-white/10" />
                    </>
                  )}
                  <SidebarHeading>{t("sidebarModules")}</SidebarHeading>
                  <nav
                    aria-label={t("sidebarModules")}
                    className="flex flex-col gap-px"
                  >
                    {groups.map((group) => {
                      const isOpen = isModuleOpen(group);
                      return (
                        <button
                          key={group.key}
                          type="button"
                          aria-expanded={isOpen}
                          aria-haspopup="menu"
                          onClick={(event) => onModuleClick(group, event)}
                          onPointerEnter={(event) =>
                            onModulePointerEnter(group, event)
                          }
                          onPointerLeave={onModulePointerLeave}
                          className={cn(
                            "mx-2.5 flex min-h-10 w-[calc(100%-20px)] shrink-0 cursor-pointer items-center gap-3 rounded-[9px] border-0 px-3 py-1.5 text-left text-sm [font-family:inherit]",
                            moduleRowTone(group.active, isOpen),
                            group.active ? "font-semibold" : "font-medium",
                          )}
                        >
                          <Icon
                            name={group.icon}
                            size={18}
                            className="shrink-0"
                          />
                          {/* A long module name ("Other revenue management") wraps to a second
                              line rather than being cut short. */}
                          <span className="line-clamp-2 min-w-0 leading-tight">
                            {group.title}
                          </span>
                          {group.active && (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-sky-300"
                              aria-label={t("sidebarCurrentModule")}
                            />
                          )}
                          <Icon
                            name="chevron-right"
                            size={16}
                            className="ml-auto shrink-0 opacity-60"
                          />
                        </button>
                      );
                    })}
                  </nav>
                </>
              )}
              {footer && (
                <div className="mt-2 border-t border-white/10 px-[18px] py-3">
                  {footer}
                </div>
              )}
            </div>
          </>
        )}

        <div
          className={cn(
            "flex shrink-0 items-center border-t border-white/10",
            // The copyright gets a line of its own: beside the button it squeezed "Collapse"
            // onto two lines and was itself cut short.
            collapsed
              ? "justify-center py-2.5"
              : "flex-col items-start gap-0.5 px-2.5 py-2",
          )}
        >
          <button
            type="button"
            onClick={() => {
              closeFlyout();
              setCollapsed(!collapsed);
            }}
            aria-label={collapsed ? t("sidebarExpand") : t("sidebarCollapse")}
            title={collapsed ? t("sidebarExpand") : undefined}
            aria-expanded={!collapsed}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-[9px] border-0 text-[13px] font-medium text-white/85 [font-family:inherit] hover:bg-white/10 hover:text-white",
              collapsed
                ? "size-11 justify-center bg-white/[0.07]"
                : "h-9 bg-transparent px-2.5",
            )}
          >
            <Icon
              name={collapsed ? "chevrons-right" : "chevrons-left"}
              size={18}
            />
            {!collapsed && t("sidebarCollapse")}
          </button>
          {!collapsed && (
            <span className="px-2.5 text-[11px] leading-snug text-white/55">
              {t("copyright", { year: 2026, brand: appConfig.shortName })}
            </span>
          )}
        </div>
      </aside>

      {openFlyout && openGroup && (
        <SidebarFlyout
          group={openGroup}
          left={openFlyout.left}
          anchorTop={openFlyout.anchorTop}
          isPinned={(href) => pins.includes(href)}
          onTogglePin={onTogglePin}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          onNavigate={closeFlyout}
          flyoutRef={flyoutRef}
        />
      )}
    </>
  );
}
