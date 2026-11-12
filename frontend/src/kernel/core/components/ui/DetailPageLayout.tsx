"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { MobileNavButton } from "@/kernel/core/components/layout/MobileNavButton";
import {
  Breadcrumb,
  type BreadcrumbItem,
} from "@/kernel/core/components/ui/Breadcrumb";
import { DetailTableCards } from "@/kernel/core/components/ui/DetailTableCards";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { PageHeaderUserMenu } from "@/kernel/core/components/ui/PageHeaderUserMenu";
import { Link } from "@/kernel/i18n/navigation";

export interface DetailPageLayoutProps {
  pageTitle?: string;
  pageDescription?: string;
  breadcrumbs: BreadcrumbItem[];
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Input screens set this: closing would drop what the user has typed. */
  hideClose?: boolean;
}

/** Where the X goes: the last linked crumb before the current page (the list or a parent record). */
function closeTarget(breadcrumbs: BreadcrumbItem[]): string | undefined {
  return breadcrumbs
    .slice(0, -1)
    .reverse()
    .find((crumb) => crumb.href)?.href;
}

export function DetailPageLayout({
  pageTitle,
  pageDescription,
  breadcrumbs,
  title,
  subtitle,
  actions,
  children,
  footer,
  hideClose,
}: Readonly<DetailPageLayoutProps>) {
  const t = useTranslations("common");
  const closeHref = hideClose ? undefined : closeTarget(breadcrumbs);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {pageTitle ? (
        <PageHeader title={pageTitle} description={pageDescription ?? ""} />
      ) : (
        <div className="flex shrink-0 items-center justify-end border-b border-border-secondary bg-surface-primary px-5 py-[13px] lg:box-border lg:min-h-[length:var(--app-header-height)] max-lg:justify-between max-lg:py-2 max-lg:pl-1.5 max-lg:pr-3">
          <MobileNavButton />
          <PageHeaderUserMenu />
        </div>
      )}

      {/* On a phone the whole page scrolls instead of the article body: a pinned header there
          would leave a few lines of content under it. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 max-lg:overflow-y-auto max-lg:px-3 max-lg:py-3">
        <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[9px] border border-border-secondary bg-surface-primary max-lg:min-h-fit max-lg:flex-none">
          {/*
            Same thin scrollbar the list body and every panel use: this is the one scroller a
            detail page has, and a default-width bar here reads as a different surface. The
            header lives inside it, pinned, so the wheel over the title or its actions scrolls
            the page too instead of landing on a box that cannot scroll.
          */}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto max-lg:overflow-visible">
            <header className="sticky top-0 z-40 border-b border-border-secondary bg-surface-primary px-5 py-4 max-lg:static max-lg:px-3.5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <Breadcrumb items={breadcrumbs} />
                {closeHref ? (
                  <Link
                    href={closeHref}
                    aria-label={t("close")}
                    title={t("close")}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary max-lg:size-11"
                  >
                    <Icon name="x" size={18} className="stroke-current" />
                  </Link>
                ) : null}
              </div>
              <div className="flex items-start justify-between gap-3 max-lg:flex-col">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-text-primary">
                    {title}
                  </h1>
                  {subtitle ? (
                    <div className="mt-1 text-sm text-text-secondary">
                      {subtitle}
                    </div>
                  ) : null}
                </div>
                {actions ? (
                  // Header actions are icon buttons sized for a mouse; a phone gets 44px targets.
                  <div className="shrink-0 max-lg:w-full max-lg:[&_a[href]]:min-h-11 max-lg:[&_a[href]]:min-w-11 max-lg:[&_button]:min-h-11 max-lg:[&_button]:min-w-11">
                    {actions}
                  </div>
                ) : null}
              </div>
            </header>

            <div className="px-5 py-5 max-lg:px-3.5 max-lg:py-4">
              <DetailTableCards>{children}</DetailTableCards>
            </div>
          </div>

          {footer ? (
            <div className="flex shrink-0 items-center gap-2 border-t border-border-secondary px-5 py-3 max-lg:flex-wrap max-lg:px-3.5">
              {footer}
            </div>
          ) : null}
        </article>
      </div>
    </div>
  );
}
