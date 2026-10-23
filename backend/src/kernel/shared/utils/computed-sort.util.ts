import { DEFAULT_PICKER_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { resolvePagination } from '@shared/utils/pagination.util';

import type { PaginatedResult } from '@shared/dto/pagination.dto';
import type { ColumnValuesQuery } from '@shared/utils/column-filter.util';
import type { ColumnSortQuery } from '@shared/utils/column-sort.util';

/**
 * The in-memory twin of {@link applyColumnSort}, for a list whose rows are computed rather
 * than queried.
 *
 * A stock balance has no column to order by: it is `received − issued` over documents that
 * live in several tables, resolved on every read. Those lists therefore hold every matching
 * row already, which is what makes sorting here equivalent rather than a shortcut — it
 * reaches the whole result, not the page about to be cut from it, exactly as the SQL order
 * does for a queried list.
 *
 * The two rules it keeps from the SQL path, so a reader cannot tell the two apart:
 * numbers compare as numbers, so `9` does not follow `10`; and empty cells go last whichever
 * way the column is sorted, because a descending sort should not open on the rows that have
 * no value.
 *
 * Ties keep the list's own order rather than reversing with the direction. A queried list
 * breaks them on the row id, which a computed row does not have — three stock rows of one
 * material code differ only by their specification, and reshuffling them each time the
 * reader toggles a column they all share would be noise, not an answer.
 */
export interface ComputedSortOptions<T> {
  /** Ties, and the order the list keeps while no column is requested. */
  fallback: (a: T, b: T) => number;
  /**
   * Columns this list will not order by. A column whose cell is a control rather than a
   * value belongs here; everything the table shows as text is sortable by default, because
   * the row object carries it under the same key the table draws it by.
   */
  unsortable?: readonly string[];
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** Compares two present values, numerically when both read as numbers. */
function compareValues(left: unknown, right: unknown): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right));
}

export function sortComputedRows<T extends object>(
  rows: T[],
  query: ColumnSortQuery,
  options: ComputedSortOptions<T>,
): T[] {
  const column = query.sortBy;
  const { fallback, unsortable } = options;
  if (!column || unsortable?.includes(column)) {
    return [...rows].sort(fallback);
  }

  const direction = query.sortOrder === 'DESC' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = (a as Record<string, unknown>)[column];
    const right = (b as Record<string, unknown>)[column];
    const leftEmpty = isEmpty(left);
    const rightEmpty = isEmpty(right);
    if (leftEmpty || rightEmpty) {
      // Outside the direction flip on purpose: an empty cell is last either way.
      if (leftEmpty && rightEmpty) return fallback(a, b);
      return leftEmpty ? 1 : -1;
    }
    const rank = compareValues(left, right);
    return rank === 0 ? fallback(a, b) : rank * direction;
  });
}

/**
 * A column the database cannot produce, mapped to the row property holding its value.
 *
 * Keyed the way the API takes the column — the same key the table draws it under — so a cell
 * named for what it shows (`progress`) can read the figure behind it (`progressPercent`).
 */
export type ComputedColumnSource =
  string | ((row: Record<string, unknown>) => unknown);

export type ComputedColumnMap = Readonly<Record<string, ComputedColumnSource>>;

/** The value a computed cell carries: a property of the finished row, or a rule over it. */
function readComputedCell(row: object, source: ComputedColumnSource): unknown {
  return typeof source === 'string'
    ? (row as Record<string, unknown>)[source]
    : source(row as Record<string, unknown>);
}

/**
 * Every value a computed cell holds.
 *
 * A cell showing one value per line — the baths of a lot, the quantities of its products —
 * reads back as an array, and the two rules that follow are the ones the SQL path already
 * keeps for a multi-valued column: a selection matches the row when ANY of its values is
 * selected, and the row sorts by its SMALLEST. A scalar cell is simply an array of one.
 */
function computedCellValues(
  row: object,
  source: ComputedColumnSource,
): unknown[] {
  const value = readComputedCell(row, source);
  if (!Array.isArray(value)) return [value];
  // A cell holding nothing still holds one value — the blank one. The filter offers it and
  // matches it, exactly as it does for a scalar cell that is null.
  return value.length > 0 ? value : [null];
}

/** The value a multi-valued cell sorts by: its smallest, or nothing while it holds none. */
function smallestCellValue(row: object, source: ComputedColumnSource): unknown {
  const values = computedCellValues(row, source).filter(
    (value) => !isEmpty(value),
  );
  if (values.length === 0) return null;
  return values.reduce((left, right) =>
    compareValues(left, right) <= 0 ? left : right,
  );
}

/**
 * Orders rows by one computed column, and leaves every other sort to the database.
 *
 * It keeps the two rules of the SQL path, so a reader cannot tell the two apart: numbers
 * compare as numbers, and empty cells go last whichever way the column points. Ties hold the
 * order the query already put them in rather than reversing with the direction.
 */
export function sortByComputedColumn<T extends object>(
  rows: T[],
  query: ColumnSortQuery,
  map: ComputedColumnMap,
): T[] {
  const column = query.sortBy;
  if (!column || !(column in map)) return rows;
  const source = map[column];
  const direction = query.sortOrder === 'DESC' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = smallestCellValue(a, source);
    const right = smallestCellValue(b, source);
    const leftEmpty = isEmpty(left);
    const rightEmpty = isEmpty(right);
    if (leftEmpty || rightEmpty) {
      // Outside the direction flip on purpose: an empty cell is last either way.
      if (leftEmpty && rightEmpty) return 0;
      return leftEmpty ? 1 : -1;
    }
    return compareValues(left, right) * direction;
  });
}

/** Whether a requested column is one only the service can produce. */
export function isComputedColumn(
  column: string | undefined,
  map: ComputedColumnMap,
): boolean {
  return Boolean(column && column in map);
}

/**
 * Splits the reader's column filters into the ones SQL applies and the ones matched after
 * enrichment.
 *
 * A computed key left in the SQL half would be rejected as unknown by the list's filter map,
 * so the two halves never overlap.
 */
export function splitComputedFilters(
  selections: Record<string, string[]> | undefined,
  map: ComputedColumnMap,
): {
  sql: Record<string, string[]> | undefined;
  computed: Record<string, string[]> | undefined;
} {
  if (!selections) return { sql: undefined, computed: undefined };
  const sql: Record<string, string[]> = {};
  const computed: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(selections)) {
    if (key in map) computed[key] = values;
    else sql[key] = values;
  }
  return {
    sql: Object.keys(sql).length > 0 ? sql : undefined,
    computed: Object.keys(computed).length > 0 ? computed : undefined,
  };
}

/** The values a computed cell carries, as text — the way the filter offers and matches them. */
function computedCellTexts(
  row: object,
  source: ComputedColumnSource,
): string[] {
  return computedCellValues(row, source).map(cellText);
}

/** One computed value as the filter shows it. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  // A computed cell holds a scalar, or a list of them; anything else is a programming error,
  // shown as its JSON rather than as the useless `[object Object]`.
  return JSON.stringify(value) ?? '';
}

/** Keeps a row whose every filtered computed cell carries one of the selected values. */
export function matchesComputedFilters(
  row: object,
  selections: Record<string, string[]> | undefined,
  map: ComputedColumnMap,
): boolean {
  if (!selections) return true;
  for (const [key, values] of Object.entries(selections)) {
    const source = map[key];
    if (!source || values.length === 0) continue;
    const texts = computedCellTexts(row, source);
    if (!texts.some((text) => values.includes(text))) return false;
  }
  return true;
}

/**
 * Distinct values of one computed column, highest first — the order the SQL value picker
 * lists a column in, so a reader cannot tell the two kinds of column apart.
 */
export function computedColumnValues(
  rows: readonly object[],
  column: string,
  map: ComputedColumnMap,
): string[] {
  const source = map[column];
  if (!source) return [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const text of computedCellTexts(row, source)) seen.add(text);
  }
  return [...seen].sort((a, b) => {
    const left = Number(a);
    const right = Number(b);
    if (a !== '' && b !== '' && !Number.isNaN(left) && !Number.isNaN(right)) {
      return right - left;
    }
    if (a === b) return 0;
    return a < b ? 1 : -1;
  });
}

/**
 * One page of a computed column's distinct values, for the list table's column filter.
 *
 * The SQL picker narrows the values themselves by `search`, not the rows behind them, and
 * this does the same so both kinds of column behave alike in the popup.
 */
export function paginateComputedValues(
  rows: readonly object[],
  query: ColumnValuesQuery,
  map: ComputedColumnMap,
): PaginatedResult<string> {
  const all = computedColumnValues(rows, query.column, map);
  const keyword = query.search?.trim().toLowerCase();
  const values = keyword
    ? all.filter((value) => value.toLowerCase().includes(keyword))
    : all;
  const { page, limit, skip, take } = resolvePagination(
    query,
    DEFAULT_PICKER_PAGE_SIZE,
  );
  return paginate(values.slice(skip, skip + take), values.length, page, limit);
}
