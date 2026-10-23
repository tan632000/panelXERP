"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ReactNode, RefObject } from "react";

/** Matches the hover tint the list tables paint on the row under the pointer. */
const HOVER_BG = "#f7f9ff";

export interface FrozenColumns {
  /** Goes on the `<table>`; carries the ref this hook measures and its own scope. */
  tableProps: {
    ref: RefObject<HTMLTableElement | null>;
    "data-frozen-scope": string;
  };
  /** Render inside the table's wrapper; carries the rules that pin the columns. */
  frozenStyle: ReactNode;
  /** Goes on every `th` and `td`, naming the column that cell belongs to. */
  cellProps: (columnIndex: number) => { "data-frozen-col": number };
}

/**
 * Pins the first `frozenColumnCount` columns of a hand-built list table, the way Excel
 * freezes panes up to a chosen column.
 *
 * The offset of a pinned cell is the width of everything before it, and these tables let
 * their columns size themselves, so the widths are measured from the rendered header rather
 * than declared. They are re-measured whenever the table's own box changes, which covers a
 * window resize, a column being shown or hidden, and a page of rows arriving.
 *
 * A cell is addressed by `data-frozen-col` rather than by its position in the row: these
 * tables merge a record's cells with `rowSpan`, so the second row of a group starts at a
 * different column from the first and `nth-child` would pin the wrong cell.
 *
 * The generated backgrounds sit in `:where()`, at zero specificity, so a row that paints
 * itself — a ticked row, an overdue one — keeps its own colour in the pinned cells too.
 */
export function useFrozenColumns(frozenColumnCount: number): FrozenColumns {
  const tableRef = useRef<HTMLTableElement>(null);
  // `useId` produces colons, which would have to be escaped in every selector below.
  const scope = useId().replace(/:/g, "");
  const [offsets, setOffsets] = useState<number[]>([]);

  const measure = useCallback(() => {
    const table = tableRef.current;
    if (!table || frozenColumnCount <= 0) {
      setOffsets((previous) => (previous.length === 0 ? previous : []));
      return;
    }

    const headerCells = Array.from(
      table.querySelectorAll<HTMLElement>("thead [data-frozen-col]"),
    );

    const next: number[] = [];
    let left = 0;
    for (let index = 0; index < frozenColumnCount; index += 1) {
      const cell = headerCells[index];
      if (!cell) break;
      next.push(left);
      left += cell.getBoundingClientRect().width;
    }

    setOffsets((previous) =>
      previous.length === next.length &&
      previous.every((value, index) => value === next[index])
        ? previous
        : next,
    );
  }, [frozenColumnCount]);

  useEffect(() => {
    measure();

    const table = tableRef.current;
    if (!table) return;

    // The box changes when a column is dragged, the window resizes or a page of rows lands.
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    resize?.observe(table);

    // Showing or hiding a column past the pinned ones can leave both the pinned count and
    // the table's box untouched while the header cells themselves move, so the header row
    // is watched for cells arriving and leaving as well.
    const headerRow = table.querySelector("thead tr");
    const mutation =
      typeof MutationObserver === "undefined" || !headerRow
        ? null
        : new MutationObserver(measure);
    if (headerRow) mutation?.observe(headerRow, { childList: true });

    return () => {
      resize?.disconnect();
      mutation?.disconnect();
    };
  }, [measure]);

  const frozenStyle = useMemo(() => {
    if (offsets.length === 0) return null;

    const selector = (area: string, index: number) =>
      `table[data-frozen-scope="${scope}"] ${area}[data-frozen-col="${index}"]`;

    const rules = offsets.flatMap((left, index) => {
      const isLastFrozen = index === offsets.length - 1;
      return [
        `${selector("thead th", index)},${selector("tbody td", index)}{position:sticky;left:${left}px;}`,
        `${selector("thead th", index)}{z-index:6;}`,
        `${selector("tbody td", index)}{z-index:2;}`,
        // Zero specificity, so a row that paints its own cells still wins here.
        `:where(${selector("thead th", index)}){background-color:var(--color-surface-secondary);}`,
        `:where(${selector("tbody td", index)}){background-color:var(--color-surface-primary);}`,
        `:where(table[data-frozen-scope="${scope}"] tbody tr:hover td[data-frozen-col="${index}"]){background-color:${HOVER_BG};}`,
        isLastFrozen
          ? `${selector("thead th", index)},${selector("tbody td", index)}{box-shadow:4px 0 8px -4px rgba(15,23,42,0.15);}`
          : "",
      ];
    });

    return <style>{rules.filter(Boolean).join("")}</style>;
  }, [offsets, scope]);

  const cellProps = useCallback(
    (columnIndex: number) => ({ "data-frozen-col": columnIndex }),
    [],
  );

  return useMemo(
    () => ({
      tableProps: { ref: tableRef, "data-frozen-scope": scope },
      frozenStyle,
      cellProps,
    }),
    [cellProps, frozenStyle, scope],
  );
}
