"use client";

import React from "react";

import { DetailTableScroll } from "@/kernel/core/components/ui/DetailTableScroll";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { cn } from "@/kernel/core/lib/cn";

export interface DetailReferenceColumn<T> {
  key: string;
  header: string;
  align?: "right" | "center";
  /** Share of the table width when `layout` is `fixed`. */
  width?: string;
  render: (item: T) => React.ReactNode;
}

export interface DetailReferenceTableProps<T> {
  columns: Array<DetailReferenceColumn<T>>;
  rows: readonly T[];
  rowKey: (item: T, index: number) => string;
  /** Shown instead of the table when nothing references this record. */
  emptyMessage: string;
  emptyIcon?: string;
  /** Set to make the whole row open the referenced record. */
  onRowClick?: (item: T) => void;
  /** How many clicks fire `onRowClick`. Opening a record uses `"double"` (default), like the list `Table`. */
  activateRowOn?: "single" | "double";
  /**
   * Rows this one may not navigate to — the record already on screen, for one. They keep the
   * cursor and the hover of static content, so nothing invites a click that does nothing.
   */
  isRowClickable?: (item: T) => boolean;
  /** Extra classes per row, e.g. to mark the record being read. */
  rowClassName?: (item: T) => string | undefined;
  /** `fixed` keeps the declared column widths, so numeric columns stay even. */
  layout?: "auto" | "fixed";
  /** Matches a section title's horizontal padding, so the first and last columns are not flush with the card edge. */
  inset?: boolean;
}

const HEAD_CELL_CLASS =
  "border-b border-border-secondary bg-surface-secondary px-2 py-2 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-text-tertiary uppercase";
const BODY_CELL_CLASS =
  "border-b border-border-tertiary px-2 py-2 align-middle";

/**
 * A read-only table of records that point at the one being viewed — the purchase orders
 * raised from a plan or a request, and anything else a detail screen lists to hand the
 * reader on to.
 *
 * Feature-agnostic on purpose: the columns, the labels and the row action all arrive as
 * props, so it carries no module's field names. It is deliberately not the list `Table`,
 * which brings column filters, selection and stored preferences a detail sub-table has no
 * use for.
 */
export function DetailReferenceTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  emptyIcon = "link",
  onRowClick,
  activateRowOn = "double",
  isRowClickable,
  rowClassName,
  layout = "auto",
  inset = false,
}: Readonly<DetailReferenceTableProps<T>>) {
  if (rows.length === 0) {
    return (
      <EmptyState bordered={false} icon={emptyIcon} message={emptyMessage} />
    );
  }

  return (
    <DetailTableScroll className={inset ? "mx-0! pb-0" : undefined}>
      <table
        className={cn(
          "w-full border-collapse text-xs",
          layout === "fixed" && "table-fixed",
        )}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={cn(
                  HEAD_CELL_CLASS,
                  layout === "fixed" && "whitespace-normal!",
                  inset && "px-4!",
                  column.align === "right" && "text-right!",
                  column.align === "center" && "text-center!",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => {
            const clickable = Boolean(
              onRowClick && (isRowClickable?.(item) ?? true),
            );
            return (
              <tr
                key={rowKey(item, index)}
                className={cn(
                  clickable &&
                    "cursor-pointer transition-colors hover:bg-surface-secondary",
                  rowClassName?.(item),
                )}
                onClick={
                  clickable && activateRowOn === "single"
                    ? () => onRowClick?.(item)
                    : undefined
                }
                onDoubleClick={
                  clickable && activateRowOn === "double"
                    ? () => onRowClick?.(item)
                    : undefined
                }
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      BODY_CELL_CLASS,
                      inset && "px-4!",
                      // On a phone card the figure sits under its caption, read left to
                      // right like every other field; the important utility outranks the
                      // card stylesheet, so the card override has to be a utility too.
                      column.align === "right" &&
                        "text-right! tabular-nums whitespace-nowrap [[data-detail-cards]_&]:text-left!",
                      column.align === "center" && "text-center!",
                    )}
                  >
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </DetailTableScroll>
  );
}
