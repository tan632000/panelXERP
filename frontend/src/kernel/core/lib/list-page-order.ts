import type { TableSortState } from "@/kernel/core/types/table-sort";

/** A line-flattened document row: where the line sits inside its own document. */
export interface DocumentLineRow {
  lineIndex?: number | null;
}

/** A document a list opens with the newest first; its id breaks a tie within one day. */
export interface DatedDocumentRow {
  id: number;
}

/**
 * The page a list table draws, in the order the reader asked for.
 *
 * Sorting happens in the database over the whole list, so a sorted page is handed back
 * exactly as the API returned it. Reordering it here would answer with the screen's own
 * order instead of the requested one — which is what made column arrows look dead across
 * the warehouse lists: the rows arrived sorted and were immediately shuffled back.
 *
 * While no column is sorted the list still opens the way it always has, which is what
 * `compare` spells out.
 *
 * Every list that post-processes its page — flattening documents to lines, merging in rows
 * the API returns beside them — needs this same rule, so it lives here rather than in each
 * of them: it was wrong the same way in all of them.
 */
export function orderUnsortedPage<T>(
  rows: readonly T[],
  isSorted: boolean,
  compare: (a: T, b: T) => number,
): T[] {
  if (isSorted) return [...rows];
  return [...rows].sort(compare);
}

/**
 * Documents by their number, and the lines of one document in the order they were entered.
 *
 * The lines of a receipt or an issue belong together: a list drawing one row per line reads
 * as the documents it is made of only while they stay side by side.
 */
export function compareDocumentLines<T extends DocumentLineRow>(
  documentNo: (row: T) => string,
): (a: T, b: T) => number {
  return (a, b) =>
    documentNo(a).localeCompare(documentNo(b)) ||
    (a.lineIndex ?? 0) - (b.lineIndex ?? 0);
}

/**
 * The newest document first, the one entered last leading among those of the same day.
 *
 * A document date carries no time, so the id stands in for it: within one day the higher id
 * is the later record.
 */
export function compareNewestFirst<T extends DatedDocumentRow>(
  documentDate: (row: T) => string,
): (a: T, b: T) => number {
  return (a, b) => {
    const left = documentDate(a);
    const right = documentDate(b);
    if (left !== right) return left < right ? 1 : -1;
    return b.id - a.id;
  };
}

/**
 * The page of a line-flattened list in the order its table shows it — the rule above,
 * applied to the sort state a list table already holds.
 */
export function orderDocumentLines<T extends DocumentLineRow>(
  rows: readonly T[],
  sort: TableSortState | undefined,
  documentNo: (row: T) => string,
): T[] {
  return orderUnsortedPage(
    rows,
    Boolean(sort),
    compareDocumentLines(documentNo),
  );
}
