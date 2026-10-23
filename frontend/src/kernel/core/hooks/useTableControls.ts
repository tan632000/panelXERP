"use client";

import { useMemo } from "react";

import {
  useTableColumnFilters,
  type TableColumnFiltersController,
} from "@/kernel/core/hooks/useTableColumnFilters";
import {
  useTableSort,
  type TableSortController,
} from "@/kernel/core/hooks/useTableSort";

import type { TableColumnFilterSelections } from "@/kernel/core/types/column-filter";
import type {
  TableSortParams,
  TableSortState,
} from "@/kernel/core/types/table-sort";

interface UseTableControlsOptions {
  /** Runs whenever a filter or the sort changes — a list resets to its first page here. */
  onChange?: () => void;
  /**
   * Names this table's view state within its list. The filter and the sort each persist
   * under their own suffix of it, so one screen with several tables names each table once.
   */
  persistKey?: string;
  /** See {@link useListViewScope} — shares this table's view state across route-split tabs. */
  scope?: string;
  /** Columns the reader may neither filter nor sort by; see {@link useTableColumnFilters}. */
  omitColumns?: readonly string[];
}

/** The list-query parameters a filtered, sorted table sends. */
export interface TableControlsParams extends TableSortParams {
  columnFilters?: string;
}

export interface TableControlsController {
  /** The filter half, for a list that words its empty state around the active count. */
  columnFilters: TableColumnFiltersController;
  /** The sort half, for a list that reads the sorted column. */
  sort: TableSortController;
  /** Every list-query parameter of both, as one value to spread and to depend on. */
  params: TableControlsParams;
  /** Spread onto a table that forwards the column-filter and sort props. */
  tableProps: {
    columnFilters: TableColumnFilterSelections;
    onColumnFiltersChange: (selections: TableColumnFilterSelections) => void;
    sort?: TableSortState;
    onSortChange: (next: TableSortState | undefined) => void;
  };
}

/**
 * Column filtering and sorting of one list table, as a single control.
 *
 * The two always travel together — the backend derives a list's sortable columns from the
 * very map its filters use — and pairing them here removes the two ways a screen wiring them
 * separately gets it wrong. Both persist keys come from one base, so a screen cannot hand
 * the filter and the sort the same key and have them overwrite each other's stored state.
 * Both query parameters come back as one `params` object, so a screen cannot spread the
 * sort into its query but leave it out of the memo that rebuilds it — a list that then keeps
 * answering with its previous order.
 *
 * The suffixes spell the keys screens already used when they wired the two by hand, so
 * moving a screen onto this hook keeps whatever view state its reader had open.
 */
export function useTableControls(
  options: UseTableControlsOptions = {},
): TableControlsController {
  const { onChange, persistKey, scope, omitColumns } = options;

  const columnFilters = useTableColumnFilters({
    onChange,
    persistKey: persistKey ? `${persistKey}.columnFilters` : undefined,
    scope,
    omitColumns,
  });
  const sort = useTableSort({
    onChange,
    persistKey: persistKey ? `${persistKey}.sort` : undefined,
    scope,
    omitColumns,
  });

  return useMemo(
    () => ({
      columnFilters,
      sort,
      params: { columnFilters: columnFilters.param, ...sort.params },
      tableProps: { ...columnFilters.tableProps, ...sort.tableProps },
    }),
    [columnFilters, sort],
  );
}
