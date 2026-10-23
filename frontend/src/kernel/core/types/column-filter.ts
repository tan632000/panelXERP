import type React from "react";

/** Selected values per column key. An absent key means the column is unfiltered. */
export type TableColumnFilterSelections = Record<string, string[]>;

/** The part of a table column the column filter reads. `TableColumn` satisfies it. */
export interface FilterableColumn {
  key: string;
  header?: React.ReactNode;
  /** Overrides the default rule: a column is filterable when its header carries text. */
  filterable?: boolean;
  /** Column key the API filters by, when it differs from the table column key. */
  filterKey?: string;
}

/** One filtered column, as the summary above a table names it. */
export interface ActiveColumnFilter {
  /** Column key the API filters by. */
  key: string;
  /** Column header text. */
  label: string;
  count: number;
}

/** Query of the distinct values one filterable column holds. */
export interface ColumnValuesParams {
  column: string;
  search?: string;
  page?: number;
  limit?: number;
  /** The table's other column selections, serialized like the list query's parameter. */
  columnFilters?: string;
}
