"use client";

import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

export interface SegmentedTab {
  key: string;
  label: string;
  icon?: string;
}

/**
 * Corner radius is not a free choice: it has to answer the row above. `rounded` pairs with the
 * squared-off `card` tone tabs, `pill` with the fully round `filled` ones. Mixing the two makes
 * the two rows read as parts of different design systems.
 */
export type SegmentedShape = "rounded" | "pill";

export interface SegmentedTabsProps {
  items: SegmentedTab[];
  activeKey?: string;
  onChange?: (key: string) => void;
  shape?: SegmentedShape;
  className?: string;
  "aria-label"?: string;
}

/**
 * The middle navigation axis: one recessed track with the selected segment raised out of it.
 * Reserved for a short, closed set of alternatives that partition whatever the pill row above
 * selected — new versus used stock, say. Being a single enclosed object, it cannot be mistaken
 * for either the pills above or the tabs below.
 */
export function SegmentedTabs({
  items,
  activeKey,
  onChange,
  shape = "pill",
  className,
  "aria-label": ariaLabel,
}: Readonly<SegmentedTabsProps>) {
  const isPill = shape === "pill";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "mb-3 inline-flex w-fit max-w-full shrink-0 items-center gap-1 self-start",
        "border border-border-secondary bg-surface-secondary p-1",
        isPill ? "rounded-full" : "rounded-lg",
        // A visible thin bar: a hidden one left a mouse no way to reach the tabs past the edge.
        "scrollbar-thin touch-pan-x overflow-x-auto overflow-y-hidden",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange?.(item.key)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 px-5 py-2",
              isPill ? "rounded-full" : "rounded-md",
              "text-sm whitespace-nowrap transition-colors [font-family:inherit]",
              isActive
                ? "bg-brand font-semibold text-white shadow-sm"
                : "bg-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {item.icon && <Icon name={item.icon} size={16} />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
