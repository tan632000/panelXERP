"use client";

import { useTranslations } from "next-intl";
import React, { Suspense, useEffect } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { ResponsiveSidebar } from "@/kernel/core/components/layout/ResponsiveSidebar";
import { ExcelJobsPanel } from "@/kernel/core/components/ui/ExcelJobsPanel";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { recordVisitedPathname } from "@/kernel/core/lib/navigation-history";
import {
  findNavigationItem,
  normalizeModulePath,
} from "@/kernel/core/permissions/route-permissions";
import { Link, usePathname } from "@/kernel/i18n/navigation";
import { isRouteFeatureEnabled } from "@/kernel/platform/features/route-feature.utils";
import { navigationConfig } from "@/kernel/platform/plugins/navigation.registry";

import type { AppSidebarProps } from "@/kernel/core/components/layout/AppSidebar";

export interface ModuleShellProps extends Pick<
  AppSidebarProps,
  "moduleKey" | "badges" | "brandLogo" | "brandName" | "footer"
> {
  children: React.ReactNode;
  /** Optional modal host rendered at module root (e.g. SalesModal). */
  modal?: React.ReactNode;
}

export function ModuleShell({
  children,
  modal,
  moduleKey,
  badges,
  brandLogo,
  brandName,
  footer,
}: ModuleShellProps) {
  const { user, can, isLoading } = useAuth();
  const pathname = usePathname();
  const t = useTranslations("common");

  // Runs after the page it wraps has mounted, so a list still reads the record it came from.
  useEffect(() => {
    recordVisitedPathname(pathname);
  }, [pathname]);

  if (isLoading) {
    return <LoadingState variant="fullscreen" />;
  }

  if (!user) {
    return null;
  }

  const currentItem = moduleKey
    ? findNavigationItem(moduleKey, pathname)
    : null;
  const normalizedPath = normalizeModulePath(pathname);
  const isFeatureRouteEnabled = isRouteFeatureEnabled(pathname);
  const hasModuleAccess = moduleKey
    ? (navigationConfig[moduleKey]?.sections ?? []).some((s) =>
        s.items.some((item) =>
          (item.permissions ?? []).some((perm) => can(perm)),
        ),
      )
    : can("*:*");
  const isModuleRoot = moduleKey ? normalizedPath === `/${moduleKey}` : false;
  const hasPageAccess = currentItem
    ? (currentItem.permissions ?? []).some((perm) => can(perm))
    : isModuleRoot && hasModuleAccess;
  const isAuthorized = isFeatureRouteEnabled && (hasPageAccess || can("*:*"));
  // "Back to module" lands on the first screen of the module this user may open: a module root
  // such as `/production` has no page of its own, so pointing there showed a 404.
  const firstReadableHref = moduleKey
    ? (navigationConfig[moduleKey]?.sections ?? [])
        .flatMap((section) => section.items)
        .find((item) => (item.permissions ?? []).some((perm) => can(perm)))
        ?.href
    : undefined;
  const moduleHref = firstReadableHref ?? "/";

  const sidebarProps = { moduleKey, badges, brandLogo, brandName, footer };

  return (
    <>
      {/* `h-dvh`: a phone's browser bar shrinks the viewport, and `h-screen` would hide the bottom
        of every page behind it. The two are the same height on a desktop.
        `relative`: an absolutely positioned descendant with no positioned ancestor (the `sr-only`
        labels of a long form) escapes `overflow-hidden` and makes the whole document scroll. */}
      <div className="relative isolate flex h-dvh w-full overflow-hidden bg-surface-tertiary text-base text-text-primary">
        <div className="flex h-full w-full overflow-hidden">
          <ResponsiveSidebar sidebar={sidebarProps}>
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-tertiary">
              {isAuthorized ? (
                <Suspense fallback={<LoadingState variant="overlay" />}>
                  {children}
                </Suspense>
              ) : (
                <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                  >
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[42%] select-none text-[clamp(10rem,24vw,18rem)] font-bold leading-none tracking-tighter text-border-secondary/35">
                      {t("accessDeniedCode")}
                    </span>
                    <div className="absolute -right-20 top-0 h-64 w-64 rounded-full bg-brand-50/70 blur-3xl" />
                    <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-danger-bg/50 blur-3xl" />
                  </div>

                  <div className="relative z-10 flex max-w-md flex-col items-center text-center">
                    <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-bg text-danger-text ring-1 ring-danger-text/10">
                      <Icon name="alert-triangle" size={28} />
                    </div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-danger-text">
                      {t("accessDeniedEyebrow")}
                    </p>
                    <h1 className="mb-3 text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
                      {t("accessDeniedTitle")}
                    </h1>
                    <p className="mb-8 text-sm leading-6 text-text-secondary md:text-base">
                      {t("accessDeniedDesc")}
                    </p>
                    <Link
                      href={moduleHref}
                      className="inline-flex min-h-10 items-center gap-2 rounded-[7px] border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand/30 focus:ring-offset-2 focus:ring-offset-surface-tertiary"
                    >
                      <Icon name="arrow-back" size={16} />
                      {t("backToModule")}
                    </Link>
                  </div>
                </div>
              )}
            </main>
          </ResponsiveSidebar>
        </div>
        {modal}
        <ExcelJobsPanel />
      </div>
    </>
  );
}
