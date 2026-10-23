"use client";

import { useCallback, useEffect, useRef } from "react";

import type { BulkDeleteId } from "@/kernel/core/types/bulk-delete";

/**
 * Remembers how each row of a list is named, for as long as the list screen is open.
 *
 * A selection spans pages, so a report about one of its rows — why a bulk delete kept it —
 * may concern a row the loaded page no longer holds. Looking the name up in the current page
 * would leave those rows unnamed, so every row is remembered as it is loaded.
 */
export function useRowLabels<T, TId extends BulkDeleteId = number>(
  rows: T[],
  entry: (row: T) => readonly [TId, string | null | undefined],
): (id: TId) => string | undefined {
  const labels = useRef(new Map<TId, string>());
  const readEntry = useRef(entry);

  useEffect(() => {
    readEntry.current = entry;
  });

  useEffect(() => {
    for (const row of rows) {
      const [id, label] = readEntry.current(row);
      if (label) labels.current.set(id, label);
    }
  }, [rows]);

  return useCallback((id: TId) => labels.current.get(id), []);
}
