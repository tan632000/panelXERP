"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { Link } from "@/kernel/i18n/navigation";

export interface BreadcrumbItem {
  label: React.ReactNode;
  href?: string;
  icon?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

function CrumbInner({ item }: Readonly<{ item: BreadcrumbItem }>) {
  return (
    <>
      {item.icon ? (
        <Icon name={item.icon} size={16} className="shrink-0 stroke-current" />
      ) : null}
      <span className="truncate">{item.label}</span>
    </>
  );
}

export function Breadcrumb({ items }: Readonly<BreadcrumbProps>) {
  const t = useTranslations("common");

  if (items.length === 0) return null;

  return (
    <nav aria-label={t("breadcrumb")} className="min-w-0 flex-1">
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li
              key={`${String(item.href ?? "current")}-${index}`}
              className="flex min-w-0 items-center gap-1.5"
            >
              {index > 0 ? (
                <Icon
                  name="chevron-right"
                  size={14}
                  className="shrink-0 text-text-tertiary"
                />
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="inline-flex min-w-0 items-center gap-1.5 border-0 border-b-2 border-transparent text-sm text-text-secondary transition-colors [font-family:inherit] hover:border-brand hover:font-semibold hover:text-brand"
                >
                  <CrumbInner item={item} />
                </Link>
              ) : (
                <span
                  className="inline-flex min-w-0 items-center gap-1.5 font-medium text-text-primary"
                  aria-current={isLast ? "page" : undefined}
                >
                  <CrumbInner item={item} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
