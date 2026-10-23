"use client";

import { useCallback, useMemo } from "react";

import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import { isTableSortState, serializeSort } from "@/kernel/core/lib/table-sort";

import type {
  TableSortParams,
  TableSortState,
} from "@/kernel/core/types/table-sort";

interface UseTableSortOptions {
  /** Runs whenever the sort changes — a list resets to its first page here. */
  onChange?: () => void;
  /**
   * Names this sort within its list, which keeps it alive while the reader steps into a
   * record and back. A screen with several tables gives each table its own name.
   */
  persistKey?: string;
  /** See {@link useListViewScope} — shares this table's sort across route-split tabs. */
  scope?: string;
  /**
   * Columns the reader may not sort by — a price column without the price scope. A shared
   * link can still carry a sort on one; the list then keeps its default order.
   */
  omitColumns?: readonly string[];
}

export interface TableSortController {
  /** The `sortBy`/`sortOrder` list-query parameters, empty while the list is unsorted. */
  params: TableSortParams;
  /** The sorted column, for a list that words its own empty state around it. */
  sort?: TableSortState;
  /** Spread onto a table that forwards the sort props. */
  tableProps: {
    sort?: TableSortState;
    onSortChange: (next: TableSortState | undefined) => void;
  };
}

/**
 * Sort state of one list table: the props its table needs, the parameters its query sends,
 * and a page reset whenever the sorted column changes.
 *
 * Sorting happens in the database, so it covers every row of the list rather than the page
 * the client happens to hold — which is also why changing it has to send the reader back to
 * page 1: the row they were looking at is somewhere else entirely now.
 */
export function useTableSort(
  options: UseTableSortOptions = {},
): TableSortController {
  const { onChange, persistKey, scope, omitColumns } = options;
  const [storedSort, setSort] = useListViewState<TableSortState | undefined>(
    persistKey,
    undefined,
    { scope, isValid: isTableSortState },
  );
  const sort =
    storedSort && omitColumns?.includes(storedSort.key)
      ? undefined
      : storedSort;

  const change = useCallback(
    (next: TableSortState | undefined) => {
      setSort(next);
      onChange?.();
    },
    [onChange, setSort],
  );

  return useMemo(
    () => ({
      params: serializeSort(sort),
      sort,
      tableProps: { sort, onSortChange: change },
    }),
    [change, sort],
  );
}
