"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";

export interface TableSelectionBarProps {
  count: number;
  onClear: () => void;
  /** What can be done to the ticked rows, e.g. a bulk delete. */
  actions?: React.ReactNode;
  /**
   * `bottom` docks the bar under the rows, as a phone's card list does: the actions then share
   * the full width as thumb-sized buttons.
   */
  placement?: "top" | "bottom";
}

/**
 * The rows a table currently has ticked, and what can be done to them.
 *
 * It sits inside the table's own frame, directly above the rows it counts, and appears only
 * while something is ticked: an action over a selection belongs next to that selection
 * rather than in the page toolbar, where it would sit beside the create button and read as
 * one more thing the page always offers.
 */
export function TableSelectionBar({
  count,
  onClear,
  actions,
  placement = "top",
}: Readonly<TableSelectionBarProps>) {
  const t = useTranslations("common.bulkDelete");

  if (count === 0) return null;

  if (placement === "bottom") {
    return (
      <div
        data-selection-bar="bottom"
        className="flex shrink-0 flex-col gap-1.5 border-t border-brand-100 bg-brand-50 px-3 pb-3 pt-2"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-brand">
            {t("selected", { count })}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer border-0 bg-transparent px-0 py-1.5 text-[13px] font-semibold text-info-text [font-family:inherit]"
          >
            {t("clearSelection")}
          </button>
        </div>
        {actions ? (
          <div className="grid w-full auto-cols-fr grid-flow-col gap-1.5 [&_button]:h-10 [&_button]:w-full [&_button]:justify-center">
            {actions}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-secondary bg-brand-50/60 px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {t("selected", { count })}
      </span>

      <button
        type="button"
        onClick={onClear}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border-secondary bg-surface-primary px-2 py-0.5 text-xs text-text-secondary transition-colors hover:text-text-primary [font-family:inherit]"
      >
        <Icon name="x" size={12} />
        {t("clearSelection")}
      </button>

      {actions ? (
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
