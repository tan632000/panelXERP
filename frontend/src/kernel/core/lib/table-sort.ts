import { isColumnFilterable } from "@/kernel/core/lib/table-column-filter";

import type {
  SortableColumn,
  TableSortParams,
  TableSortState,
} from "@/kernel/core/types/table-sort";

/**
 * A column carries a sort control exactly when it carries a filter, because the backend
 * builds a list's sortable columns out of the very map its filters use: a column the API
 * cannot filter, it cannot order by either, and an arrow on one would quietly leave the list
 * in its default order. That ties the two controls together rather than letting each decide
 * from the header on its own — which had columns marked unfilterable still showing an arrow,
 * and the numeric columns, whose header is a right-aligned node rather than plain text,
 * showing a funnel but no arrow.
 *
 * `sortable: true` opts a column in on its own, for the few a list sorts by without
 * filtering: a value the API has always ordered by that the table does not filter on.
 */
export function isColumnSortable(column: SortableColumn): boolean {
  if (column.sortable !== undefined) return column.sortable;
  return isColumnFilterable(column);
}

/**
 * The key the API sorts this column by.
 *
 * It falls back to the filter key because the backend derives a list's sortable columns
 * from the very map its filters use, so the two always answer to the same names.
 */
export function resolveColumnSortKey(column: SortableColumn): string {
  return column.sortKey ?? column.filterKey ?? column.key;
}

/**
 * The sort after clicking one column's control: ascending, then descending, then back to
 * the list's own order. The third click is what returns a list to how it opened, so the
 * reader is never stuck with a sort they cannot take off.
 */
export function nextSortState(
  current: TableSortState | undefined,
  key: string,
): TableSortState | undefined {
  if (current?.key !== key) return { key, direction: "ASC" };
  if (current.direction === "ASC") return { key, direction: "DESC" };
  return undefined;
}

/**
 * The sort as the list query takes it, empty while the list is unsorted so an untouched
 * list keeps the same cache key it had before the column controls existed.
 */
export function serializeSort(
  sort: TableSortState | undefined,
): TableSortParams {
  if (!sort) return {};
  return { sortBy: sort.key, sortOrder: sort.direction };
}

/** Whether a value read back from a link is a sort: a column key and a direction. */
export function isTableSortState(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const { key, direction } = value as Record<string, unknown>;
  return (
    typeof key === "string" &&
    key !== "" &&
    (direction === "ASC" || direction === "DESC")
  );
}
