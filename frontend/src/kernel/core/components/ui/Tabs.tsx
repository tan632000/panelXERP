"use client";

import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { useActiveTabInView } from "@/kernel/core/hooks/useActiveTabInView";
import { cn } from "@/kernel/core/lib/cn";

export interface Tab {
  key: string;
  icon?: string;
  /**
   * The tab's name, or any node carrying it — a name with a count badge on it, say.
   *
   * A node rather than only a string because the tabs that count things exist (the maintenance
   * waiting list, the RFQ queue), and a tab whose badge could not be rendered would push the
   * count into its label text, which then cannot be styled or pluralised.
   */
  label: React.ReactNode;
  /** Optional count pill after the label, e.g. how many records the tab holds. */
  count?: number;
  onClick?: () => void;
}

export interface TabsProps {
  items: Tab[];
  activeKey?: string;
  onChange?: (key: string) => void;
  className?: string;
  "aria-label"?: string;
}

const tabInactive =
  "flex shrink-0 cursor-pointer items-center gap-1.5 border-0 border-b-2 border-transparent bg-transparent px-3.5 py-2 text-sm whitespace-nowrap text-text-secondary transition-colors hover:text-text-primary [font-family:inherit]";
const tabActive =
  "flex shrink-0 cursor-pointer items-center gap-1.5 border-0 border-b-2 border-brand bg-transparent px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-brand transition-colors [font-family:inherit]";

/**
 * The underline tab row every list screen uses. On a screen navigated on several axes it is the
 * *innermost* one — the axis sitting closest to the table it swaps — with `PillTabs` and
 * `SegmentedTabs` above it. Three visibly different controls keep the reading order obvious,
 * which three rows of the same control never manage.
 */
export function Tabs({
  items,
  activeKey,
  onChange,
  className,
  "aria-label": ariaLabel,
}: Readonly<TabsProps>) {
  const rowRef = useActiveTabInView<HTMLDivElement>(activeKey);
  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label={ariaLabel}
      className={
        className ??
        cn(
          // The rule is an inset shadow the active underline paints over. A border with tabs
          // pulled onto it by a negative margin left the row a pixel taller than its box, and
          // iPad Safari let a touch drag that pixel up and down despite overflow-y-hidden.
          "mb-[13px] flex shrink-0 shadow-[inset_0_-1px_0_var(--color-border-secondary)]",
          // A visible thin bar: a hidden one left a mouse no way to reach the tabs past the edge.
          "scrollbar-thin touch-pan-x overflow-x-auto overflow-y-hidden",
        )
      }
    >
      {items.map((t) => {
        const isActive = t.key === activeKey;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              t.onClick?.();
              onChange?.(t.key);
            }}
            className={isActive ? tabActive : tabInactive}
          >
            {t.icon && <Icon name={t.icon} size={15} />}
            <span className="flex items-center gap-1.5">{t.label}</span>
            {t.count !== undefined && (
              <span className="rounded-full bg-surface-secondary px-[7px] text-[11px] font-semibold text-text-secondary">
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
