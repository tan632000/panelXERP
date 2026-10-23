"use client";

import { useTranslations } from "next-intl";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  AppSidebar,
  type AppSidebarProps,
} from "@/kernel/core/components/layout/AppSidebar";
import { MobileNavContext } from "@/kernel/core/components/layout/mobile-nav-context";
import { usePathname } from "@/kernel/i18n/navigation";

export interface ResponsiveSidebarProps {
  sidebar: Omit<AppSidebarProps, "drawer" | "onClose">;
  /** The screen beside the sidebar; its page header reaches the drawer through the context. */
  children: React.ReactNode;
}

/**
 * The sidebar rail from `lg` up, and below it (phones and tablets) a drawer the page header's
 * menu button opens. Every screen that draws the app sidebar goes through this, so none is
 * left with a rail squeezing a phone.
 */
export function ResponsiveSidebar({
  sidebar,
  children,
}: ResponsiveSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("common");
  // Keyed to the path it was opened on, so following one of its links closes it without an
  // effect.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const isDrawerOpen = drawerPath === pathname;
  const closeDrawer = () => setDrawerPath(null);
  const mobileNav = useMemo(
    () => ({ open: () => setDrawerPath(pathname) }),
    [pathname],
  );

  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerPath(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  return (
    <MobileNavContext.Provider value={mobileNav}>
      <div className="hidden lg:flex">
        <AppSidebar {...sidebar} />
      </div>
      {/* Portaled to `body` and given its own GPU layer (`transform-gpu`): Safari on iPad
        paints a page's sticky table header, which sits on a composited layer of its
        scrolling box, over any fixed layer that has none, whatever its z-index. */}
      {isDrawerOpen &&
        createPortal(
          <div className="fixed inset-0 z-[95] flex transform-gpu lg:hidden">
            <button
              type="button"
              aria-label={t("closeMenu")}
              onClick={closeDrawer}
              className="absolute inset-0 cursor-default border-0 bg-black/40"
            />
            <div className="relative flex h-full">
              <AppSidebar {...sidebar} drawer onClose={closeDrawer} />
            </div>
          </div>,
          document.body,
        )}
      {children}
    </MobileNavContext.Provider>
  );
}
