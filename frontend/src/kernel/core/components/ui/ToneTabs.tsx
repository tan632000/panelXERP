"use client";

import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { useActiveTabInView } from "@/kernel/core/hooks/useActiveTabInView";
import { cn } from "@/kernel/core/lib/cn";

/**
 * The meaning a destination carries — quality, condition, or whatever the axis separates. It is
 * the colour of the tab itself, not decoration, so the reader tells OK from NG before reading
 * a word.
 */
export type ToneTabTone = "success" | "danger" | "warning" | "info" | "accent";

/**
 * `filled` states the selection by weight: a solid tab among washed-out ones, and nothing
 * anchoring the row. `card` states it by position instead — the selected tab grows out of the
 * rule under the row, the way a physical tab sits proudest in a folder. Prefer `card` when the
 * row sits directly above the content it switches, `filled` when it must read as the heaviest
 * thing on the screen.
 */
export type ToneTabVariant = "filled" | "card";

const FILLED: Record<ToneTabTone, { active: string; inactive: string }> = {
  success: {
    active: "bg-emerald-500 text-white shadow-sm",
    inactive: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  },
  danger: {
    active: "bg-red-500 text-white shadow-sm",
    inactive: "bg-red-50 text-red-700 hover:bg-red-100",
  },
  warning: {
    active: "bg-amber-500 text-white shadow-sm",
    inactive: "bg-amber-50 text-amber-700 hover:bg-amber-100",
  },
  info: {
    active: "bg-cyan-500 text-white shadow-sm",
    inactive: "bg-cyan-50 text-cyan-700 hover:bg-cyan-100",
  },
  accent: {
    active: "bg-purple-500 text-white shadow-sm",
    inactive: "bg-purple-50 text-purple-700 hover:bg-purple-100",
  },
};

/**
 * Selected card tabs carry the tone on background, text and border at once; unselected ones
 * drop to plain text and keep the tone only on the icon, so the row never turns into a wall of
 * competing colour.
 */
const CARD: Record<ToneTabTone, { active: string; icon: string }> = {
  success: {
    active: "bg-emerald-50 text-emerald-700 border-emerald-600",
    icon: "text-emerald-600",
  },
  danger: {
    active: "bg-red-50 text-red-700 border-red-600",
    icon: "text-red-600",
  },
  warning: {
    active: "bg-amber-50 text-amber-700 border-amber-600",
    icon: "text-amber-600",
  },
  info: {
    active: "bg-cyan-50 text-cyan-700 border-cyan-600",
    icon: "text-cyan-600",
  },
  accent: {
    active: "bg-purple-50 text-purple-700 border-purple-600",
    icon: "text-purple-600",
  },
};

export interface ToneTab {
  key: string;
  label: string;
  icon?: string;
  tone: ToneTabTone;
}

export interface ToneTabsProps {
  items: ToneTab[];
  activeKey?: string;
  onChange?: (key: string) => void;
  variant?: ToneTabVariant;
  className?: string;
  "aria-label"?: string;
}

/**
 * The outermost navigation axis of a screen: one tab per destination, each carrying its own
 * meaning as colour. Used where the choice is between separate places rather than between views
 * of one list — the physical warehouses of a module, for instance. Its weight is what makes the
 * rows under it read as subordinate without needing indents or brackets.
 */
export function ToneTabs({
  items,
  activeKey,
  onChange,
  variant = "filled",
  className,
  "aria-label": ariaLabel,
}: Readonly<ToneTabsProps>) {
  const rowRef = useActiveTabInView<HTMLDivElement>(activeKey);
  const isCard = variant === "card";

  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        // min-w-0 lets the row shrink to the page width. A column flex parent
        // otherwise keeps the content width, and overflow-hidden on the page
        // clips the last tabs (the XLBM operation log row). The row stays one
        // line and scrolls sideways behind a visible bar on a narrow screen:
        // wrapping split the card tabs off their rule.
        "scrollbar-thin flex w-full min-w-0 max-w-full shrink-0 touch-pan-x items-end overflow-x-auto overflow-y-hidden",
        // The card rule is an inset shadow, not a border: the scroller clips at
        // its padding box, so a tab could not overlap a border. The selected
        // tab's background, painted under its transparent bottom border, covers
        // the shadow and still grows out of the rule.
        isCard
          ? "mb-3 gap-2 shadow-[inset_0_-1px_0_var(--color-border-secondary)]"
          : "mb-3 gap-2.5",
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
              "flex cursor-pointer items-center gap-2 whitespace-nowrap transition-colors [font-family:inherit]",
              isCard
                ? cn(
                    "shrink-0 rounded-t-lg border border-b-2 px-4 py-2.5 text-sm font-semibold",
                    isActive
                      ? cn(CARD[item.tone].active, "border-b-transparent")
                      : "border-transparent text-text-secondary hover:bg-surface-secondary/60 hover:text-text-primary",
                  )
                : cn(
                    "shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold",
                    isActive
                      ? FILLED[item.tone].active
                      : FILLED[item.tone].inactive,
                  ),
            )}
          >
            {item.icon && (
              <Icon
                name={item.icon}
                size={isCard ? 16 : 18}
                className={
                  isCard && !isActive ? CARD[item.tone].icon : undefined
                }
              />
            )}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
