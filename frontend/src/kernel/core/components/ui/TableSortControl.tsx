"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Icon } from "@kernel/core/components/ui/Icon";
import { cn } from "@kernel/core/lib/cn";

import type { TableSortDirection } from "@kernel/core/types/table-sort";

/**
 * Matches the column filter's funnel beside it, so the two controls in a header read as one
 * pair rather than one shouting over the other.
 */
const CHEVRON_SIZE = 12;

/**
 * How far the two chevrons overlap. A Tabler glyph sits inside a 24-unit box with its own
 * padding, so stacking them untouched leaves a gap that reads as two separate marks instead
 * of one up/down control; pulling them together also keeps the pair inside the header row.
 */
const CHEVRON_OVERLAP = "-mb-[5px]";

export interface TableSortControlProps {
  /** Column header text, used to name the column in the control's title. */
  columnLabel: string;
  /** How this column is sorted right now, or undefined while it is not. */
  direction?: TableSortDirection;
  onToggle: () => void;
}

/**
 * Ascending/descending control for one table column.
 *
 * It sits beside the column filter rather than turning the header text into a button: the
 * header already carries the column-resize handle, and a click target spanning the whole
 * cell would fire every time the reader finishes dragging a column wider.
 *
 * Both chevrons stay visible so an unsorted column still advertises that it can be sorted;
 * the active one is the one that lights up.
 */
export function TableSortControl({
  columnLabel,
  direction,
  onToggle,
}: Readonly<TableSortControlProps>) {
  const t = useTranslations("common.tableSort");
  const isSorted = direction !== undefined;

  const title = (() => {
    if (direction === "ASC") return t("sortedAsc", { column: columnLabel });
    if (direction === "DESC") return t("sortedDesc", { column: columnLabel });
    return t("sortColumn", { column: columnLabel });
  })();

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      className={cn(
        "inline-flex shrink-0 cursor-pointer flex-col items-center justify-center rounded p-0.5 align-middle leading-none transition-colors",
        isSorted
          ? "bg-brand text-white"
          : "text-text-tertiary hover:bg-black/5 hover:text-text-primary",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Icon
        name="chevron-up"
        size={CHEVRON_SIZE}
        className={cn(
          CHEVRON_OVERLAP,
          // Both chevrons show on an unsorted column; once sorted, the inactive one recedes
          // so the direction reads at a glance rather than having to be compared.
          isSorted && direction !== "ASC" && "opacity-40",
        )}
      />
      <Icon
        name="chevron-down"
        size={CHEVRON_SIZE}
        className={cn(isSorted && direction !== "DESC" && "opacity-40")}
      />
    </button>
  );
}
