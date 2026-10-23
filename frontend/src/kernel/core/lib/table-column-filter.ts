import React from "react";

import type {
  FilterableColumn,
  TableColumnFilterSelections,
} from "@/kernel/core/types/column-filter";

function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(nodeText).join(" ");
  }

  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return nodeText(props.children);
  }

  return "";
}

/** Header text of a column, naming it in its filter and in the summary above the table. */
export function resolveColumnFilterLabel(column: FilterableColumn): string {
  return nodeText(column.header).replace(/\s+/g, " ").trim();
}

/**
 * A column with no header text — the actions column, for one — carries no filter, and
 * neither does a column the caller marked unfilterable because the API cannot filter it.
 */
export function isColumnFilterable(column: FilterableColumn): boolean {
  if (column.filterable !== undefined) return column.filterable;
  return resolveColumnFilterLabel(column) !== "";
}

export function resolveColumnFilterKey(column: FilterableColumn): string {
  return column.filterKey ?? column.key;
}

export function countActiveColumnFilters(
  selections: TableColumnFilterSelections,
): number {
  return Object.values(selections).filter((values) => values.length > 0).length;
}

/** Sets or clears one column's selection, dropping empty entries. */
export function withColumnSelection(
  selections: TableColumnFilterSelections,
  columnKey: string,
  values: string[] | undefined,
): TableColumnFilterSelections {
  const next = { ...selections };
  if (!values || values.length === 0) {
    delete next[columnKey];
    return next;
  }
  next[columnKey] = values;
  return next;
}

/**
 * Orders a column filter's values the way the column's option list orders them — a
 * classification reads in catalog order rather than newest row first. Values the list does
 * not know keep their place after it.
 */
export function orderByOptions(
  options: ReadonlyArray<{ value: string }>,
): (a: string, b: string) => number {
  const rank = new Map(options.map((option, index) => [option.value, index]));
  const rankOf = (value: string) => rank.get(value) ?? options.length;
  return (a, b) => rankOf(a) - rankOf(b);
}

/**
 * The selections as the list API takes them: one JSON parameter, absent while nothing is
 * filtered so an unfiltered list keeps its cache key.
 */
export function serializeColumnFilters(
  selections: TableColumnFilterSelections,
): string | undefined {
  const active = Object.entries(selections).filter(
    ([, values]) => values.length > 0,
  );
  if (active.length === 0) return undefined;
  return JSON.stringify(Object.fromEntries(active));
}

const pad2 = (part: string) => part.padStart(2, "0");

/**
 * A search typed the way a labelled cell reads a date or number — `19/09/2026`, `09/2026`,
 * `19/09`, `98.000`, `0,636` — rewritten in the form the column stores it, so the server can
 * match it. Null for any other text, which only the labels the client holds can match.
 *
 * Dots count as thousands separators only in groups of three, so `1.5` stays as typed.
 */
export function toStoredValueSearch(input: string): string | null {
  const text = input.trim();
  const fullDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (fullDate) {
    return `${fullDate[3]}-${pad2(fullDate[2])}-${pad2(fullDate[1])}`;
  }
  const monthYear = /^(\d{1,2})\/(\d{4})$/.exec(text);
  if (monthYear) return `${monthYear[2]}-${pad2(monthYear[1])}`;
  const dayMonth = /^(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (dayMonth) return `-${pad2(dayMonth[2])}-${pad2(dayMonth[1])}`;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text) || /^-?\d+,\d+$/.test(text)) {
    return text.replace(/\./g, "").replace(",", ".");
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) return text;
  return null;
}

/** List-query parameters a column-values request never carries as list scope. */
const NON_SCOPE_PARAMS = new Set([
  "page",
  "limit",
  "sortBy",
  "sortOrder",
  "columnFilters",
]);

/**
 * A list's query turned into the scope its column filters send: every toolbar filter as
 * text, the keyword renamed `listSearch` (on that endpoint `search` narrows the values), and
 * no paging, sort or column selections — the table sends those itself, minus the open
 * column. The column filter then offers only the values of the rows on screen, as in Excel.
 */
export function columnFilterScope(
  params: object,
): Record<string, string> | undefined {
  const scope: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (NON_SCOPE_PARAMS.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    const text = Array.isArray(value) ? value.join(",") : String(value);
    if (text === "") continue;
    scope[key === "search" ? "listSearch" : key] = text;
  }
  return Object.keys(scope).length > 0 ? scope : undefined;
}

/** Whether a value read back from a link is a column selection: string lists per column. */
export function isColumnFilterSelections(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (values) =>
      Array.isArray(values) &&
      values.every((entry) => typeof entry === "string"),
  );
}
