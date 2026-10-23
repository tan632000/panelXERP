"use client";

import { useCallback, useMemo } from "react";

import { useListViewState } from "@/kernel/core/hooks/useListViewState";
import {
  countActiveColumnFilters,
  isColumnFilterSelections,
  serializeColumnFilters,
} from "@/kernel/core/lib/table-column-filter";

import type { TableColumnFilterSelections } from "@/kernel/core/types/column-filter";

interface UseTableColumnFiltersOptions {
  /** Runs whenever the selections change — a list resets to its first page here. */
  onChange?: () => void;
  /**
   * Names these selections within their list, which keeps them alive while the reader works
   * elsewhere in the same browser tab. A screen with several tables gives each table its own name.
   */
  persistKey?: string;
  /** See {@link useListViewScope} — shares this table's selections across route-split tabs. */
  scope?: string;
  /**
   * Columns the reader may not filter by — a price column without the price scope. A shared
   * link can still carry a selection on one; it is left out of the query and the count.
   */
  omitColumns?: readonly string[];
}

export interface TableColumnFiltersController {
  /** The `columnFilters` list-query parameter, absent while nothing is filtered. */
  param?: string;
  /** How many columns carry a selection; feeds a list's empty-state wording. */
  activeCount: number;
  /** Spread onto a table that forwards the column-filter props. */
  tableProps: {
    columnFilters: TableColumnFilterSelections;
    onColumnFiltersChange: (selections: TableColumnFilterSelections) => void;
  };
}

/**
 * Column-filter state of one list table: the props its table needs, the parameter its
 * query sends, and a page reset whenever the selection changes.
 */
export function useTableColumnFilters(
  options: UseTableColumnFiltersOptions = {},
): TableColumnFiltersController {
  const { onChange, persistKey, scope, omitColumns } = options;
  const [stored, setSelections] = useListViewState<TableColumnFilterSelections>(
    persistKey,
    {},
    {
      scope,
      isValid: isColumnFilterSelections,
    },
  );
  const omitKey = omitColumns?.join(",") ?? "";
  const selections = useMemo(
    () => withoutColumns(stored, omitKey),
    [stored, omitKey],
  );

  const change = useCallback(
    (next: TableColumnFilterSelections) => {
      setSelections(next);
      onChange?.();
    },
    [onChange, setSelections],
  );

  return useMemo(
    () => ({
      param: serializeColumnFilters(selections),
      activeCount: countActiveColumnFilters(selections),
      tableProps: {
        columnFilters: selections,
        onColumnFiltersChange: change,
      },
    }),
    [change, selections],
  );
}

function withoutColumns(
  selections: TableColumnFilterSelections,
  omitKey: string,
): TableColumnFilterSelections {
  if (!omitKey) return selections;
  const omitted = new Set(omitKey.split(","));
  if (!Object.keys(selections).some((key) => omitted.has(key))) {
    return selections;
  }
  return Object.fromEntries(
    Object.entries(selections).filter(([key]) => !omitted.has(key)),
  );
}
