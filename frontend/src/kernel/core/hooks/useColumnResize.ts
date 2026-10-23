"use client";

import { useCallback, useState } from "react";

import type { ListColumnPreferences } from "@/kernel/core/hooks/api/useListColumnPreferences";
import type React from "react";

/** Narrowest a column can be dragged. */
export const MIN_RESIZED_COLUMN_WIDTH = 40;

/**
 * Cell wrapper class: one line while the columns keep their natural widths, wrapping inside
 * the chosen width once the reader has sized them. See `.table-cell-nowrap` /
 * `.table-cell-wrap` in `app/globals.css`.
 */
export function tableCellWrapClass(layoutLocked: boolean): string {
  return layoutLocked
    ? "table-cell-wrap whitespace-normal break-words"
    : "table-cell-nowrap whitespace-nowrap";
}

/** Header title class: the same rule as {@link tableCellWrapClass}, for a title. */
export function tableHeaderWrapClass(layoutLocked: boolean): string {
  return layoutLocked ? "whitespace-normal break-words" : "whitespace-nowrap";
}

export interface ColumnResize {
  /** Width in pixels of every column once the layout is locked, keyed by column key. */
  columnWidths: Record<string, number>;
  /**
   * True once the reader has sized the columns (a drag, or stored widths restored). The
   * table then lays out with `table-layout: fixed` at `columnWidths`, and text wraps.
   */
  layoutLocked: boolean;
  /**
   * `onMouseDown` for the resize handle of one column. The first drag locks every
   * `th[data-col-key]` in the table head at its rendered width, so widening one column never
   * reflows the others; the final layout is stored once the drag ends.
   */
  startResize: (key: string) => (event: React.MouseEvent<HTMLElement>) => void;
}

/**
 * Drag-to-resize column widths, stored on the account through the list's preferences so a
 * list comes back at the same layout after leaving the screen or signing out. A table with
 * no preference key passes inert preferences and keeps the widths for this visit only.
 */
export function useColumnResize(
  preferences: Pick<ListColumnPreferences, "columnWidths" | "setColumnWidths">,
): ColumnResize {
  const stored = preferences.columnWidths;
  const { setColumnWidths: storeColumnWidths } = preferences;
  const [columnWidths, setColumnWidths] =
    useState<Record<string, number>>(stored);
  // Stored widths were captured from a locked layout, so restoring them restores the lock.
  const [layoutLocked, setLayoutLocked] = useState(
    Object.keys(stored).length > 0,
  );

  // The stored widths arrive with the preference request, usually after the first paint;
  // adopted while rendering (React's "adjust state on a prop change") rather than in an
  // effect, so the table never paints a frame at the old widths.
  const [adoptedStored, setAdoptedStored] = useState(stored);
  if (stored !== adoptedStored) {
    setAdoptedStored(stored);
    if (Object.keys(stored).length > 0) {
      setColumnWidths(stored);
      setLayoutLocked(true);
    }
  }

  const startResize = useCallback(
    (key: string) => (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const th = event.currentTarget.closest("th");
      // A grouped header spreads its columns over several rows, so the whole head is read.
      const header = th?.closest("thead");

      let widths = columnWidths;
      if (!layoutLocked && header) {
        const locked: Record<string, number> = {};
        header
          .querySelectorAll<HTMLElement>("th[data-col-key]")
          .forEach((cell) => {
            const cellKey = cell.dataset.colKey;
            // Rounded up so a column the reader did not touch never ends a fraction of a
            // pixel short of its one-line content, which would wrap its title.
            if (cellKey) {
              locked[cellKey] = Math.ceil(cell.getBoundingClientRect().width);
            }
          });
        widths = { ...locked, ...columnWidths };
        setColumnWidths(widths);
        setLayoutLocked(true);
      }

      let moved = false;
      const startX = event.clientX;
      const startWidth = widths[key] ?? th?.getBoundingClientRect().width ?? 0;

      const onPointerMove = (moveEvent: MouseEvent) => {
        const nextWidth = Math.max(
          MIN_RESIZED_COLUMN_WIDTH,
          startWidth + (moveEvent.clientX - startX),
        );
        moved = true;
        widths = { ...widths, [key]: nextWidth };
        setColumnWidths(widths);
      };
      const onPointerUp = () => {
        window.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("mouseup", onPointerUp);
        // Stored once per drag rather than per mouse move: one write for the final layout.
        if (moved) storeColumnWidths(widths);
      };

      window.addEventListener("mousemove", onPointerMove);
      window.addEventListener("mouseup", onPointerUp);
    },
    [columnWidths, layoutLocked, storeColumnWidths],
  );

  return { columnWidths, layoutLocked, startResize };
}

/**
 * Inline width of one column once sized: the dragged width wins over every bound the
 * column declared, inline or by class (`max-w-[240px]`), so a column dragged wider widens.
 */
export function resizedColumnStyle(
  width: number | undefined,
): React.CSSProperties | undefined {
  if (width === undefined) return undefined;
  return { width, minWidth: width, maxWidth: width };
}
