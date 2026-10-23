import type React from "react";

/** Direction a list column is sorted in, spelled the way the list API takes it. */
export type TableSortDirection = "ASC" | "DESC";

/** The column a list table is sorted by. Absent means the list's own default order. */
export interface TableSortState {
  /** Column key the API sorts by. */
  key: string;
  direction: TableSortDirection;
}

/** The part of a table column the sort control reads. `TableColumn` satisfies it. */
export interface SortableColumn {
  key: string;
  header?: React.ReactNode;
  /** Overrides the default rule: a column is sortable exactly when it is filterable. */
  sortable?: boolean;
  /** Read by the default rule — see {@link isColumnFilterable}. */
  filterable?: boolean;
  /**
   * Column key the API sorts by, when it differs from the table column key. Defaults to the
   * filter key, because a list sorts and filters through one set of column keys.
   */
  sortKey?: string;
  /** Column key the API filters by; the sort falls back to it. */
  filterKey?: string;
}

/** The `sortBy`/`sortOrder` pair a list query sends. */
export interface TableSortParams {
  sortBy?: string;
  sortOrder?: TableSortDirection;
}
