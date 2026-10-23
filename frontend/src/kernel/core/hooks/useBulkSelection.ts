"use client";

import { useCallback, useMemo, useState } from "react";

import type { BulkDeleteId } from "@/kernel/core/types/bulk-delete";

export interface BulkSelection {
  /**
   * Row keys currently ticked, for the table. Also the ids a bulk request sends when the
   * list is keyed by a business code rather than a numeric primary key.
   */
  selectedKeys: string[];
  /** The same rows as numeric ids, for a bulk request on a numerically keyed list. */
  selectedIds: number[];
  count: number;
  /** Drops the selection, e.g. once a bulk action has run. */
  clear: () => void;
  /** Unticks the given ids, leaving the rest selected. */
  deselect: (ids: BulkDeleteId[]) => void;
  /** Spread onto a table that renders the checkbox column. */
  tableProps: {
    selectedKeys: string[];
    onSelectionChange: (keys: string[]) => void;
  };
}

/**
 * Holds which rows of a list are ticked.
 *
 * A bulk action works on the page in view: the table drops a row from the selection once it
 * leaves that page — paging on, a search or filter that hides it, or a batch that deleted it —
 * so the count in the selection bar is always the rows the user sees ticked.
 */
export function useBulkSelection(): BulkSelection {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const clear = useCallback(() => setSelectedKeys([]), []);

  const deselect = useCallback((ids: BulkDeleteId[]) => {
    const done = new Set(ids.map(String));
    setSelectedKeys((keys) => keys.filter((key) => !done.has(key)));
  }, []);

  const selectedIds = useMemo(
    () => selectedKeys.map(Number).filter(Number.isInteger),
    [selectedKeys],
  );

  const tableProps = useMemo(
    () => ({ selectedKeys, onSelectionChange: setSelectedKeys }),
    [selectedKeys],
  );

  return {
    selectedKeys,
    selectedIds,
    count: selectedKeys.length,
    clear,
    deselect,
    tableProps,
  };
}
