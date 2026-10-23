"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { useMobileNav } from "@/kernel/core/components/layout/mobile-nav-context";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

/**
 * Opens the sidebar drawer on a phone, where the sidebar rail is hidden. It leads the page
 * header, the one bar every module screen draws, and disappears from `lg` up.
 */
export function MobileNavButton({
  className,
}: Readonly<{ className?: string }>) {
  const nav = useMobileNav();
  const t = useTranslations("common");

  if (!nav) return null;

  return (
    <button
      type="button"
      onClick={nav.open}
      aria-label={t("openMenu")}
      className={cn(
        "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-text-primary hover:bg-surface-secondary lg:hidden",
        className,
      )}
    >
      <Icon name="menu" size={22} />
    </button>
  );
}
