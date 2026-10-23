import type { ExcelImportRow } from "@/kernel/core/types/excel";

/**
 * Helpers for turning the keyed rows a kernel parse job returns into documents: header+lines
 * records laid out one row per line, header cells repeated on every row, as the exports write
 * them. Features keep their own business rules; these own only the sheet mechanics.
 */

/** One document an uploaded sheet describes: its code (blank for a new one) and its rows. */
export interface ExcelImportGroup {
  code: string;
  /** The document's first row — where a header-level problem is reported. */
  fileRow: number;
  rows: ExcelImportRow[];
}

/** A header cell of a later row that disagrees with the document's first row. */
export interface ExcelImportHeaderConflict {
  fileRow: number;
  column: string;
}

/** A cell's trimmed text; a missing key reads as blank. */
export function cellValue(row: ExcelImportRow, key: string): string {
  return (row.values[key] ?? "").trim();
}

/**
 * Groups rows into documents. Rows sharing a code (case-insensitive) form one document,
 * wherever they sit in the sheet. Blank-code rows describe new documents: consecutive ones
 * whose header cells all agree form one document, so a new record keeps several lines.
 *
 * Every row of a document must repeat its header cells as the first row states them; a row
 * that disagrees is reported rather than silently merged under the first row's values.
 */
export function groupImportRows(
  rows: readonly ExcelImportRow[],
  options: { codeKey: string; headerKeys: readonly string[] },
): { groups: ExcelImportGroup[]; conflicts: ExcelImportHeaderConflict[] } {
  const groups: ExcelImportGroup[] = [];
  const byCode = new Map<string, ExcelImportGroup>();
  const conflicts: ExcelImportHeaderConflict[] = [];
  const headerOf = (row: ExcelImportRow) =>
    options.headerKeys.map((key) => cellValue(row, key));
  let openBlank: ExcelImportGroup | null = null;

  for (const row of rows) {
    const code = cellValue(row, options.codeKey);
    if (!code) {
      const header = headerOf(row);
      const sameHeader =
        openBlank !== null &&
        headerOf(openBlank.rows[0]).every(
          (value, index) => value === header[index],
        );
      if (openBlank && sameHeader) {
        openBlank.rows.push(row);
      } else {
        openBlank = { code: "", fileRow: row.fileRow, rows: [row] };
        groups.push(openBlank);
      }
      continue;
    }

    openBlank = null;
    const key = code.toLocaleLowerCase();
    const group = byCode.get(key);
    if (!group) {
      const created = { code, fileRow: row.fileRow, rows: [row] };
      byCode.set(key, created);
      groups.push(created);
      continue;
    }
    const first = group.rows[0];
    for (const column of options.headerKeys) {
      if (cellValue(row, column) !== cellValue(first, column)) {
        conflicts.push({ fileRow: row.fileRow, column });
      }
    }
    group.rows.push(row);
  }

  return { groups, conflicts };
}

/** `undefined` for a blank cell, `null` for one that is not a number. */
export function parseNumberCell(value: string): number | null | undefined {
  const text = value.trim().replace(/\s/g, "");
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRealIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/**
 * A date cell as `YYYY-MM-DD`. A real date cell already arrives that way from the parser;
 * a cell typed as text is also accepted in the `DD/MM/YYYY` form the screens display.
 * `undefined` for a blank cell, `null` for one that is not a real date.
 */
export function parseDateCell(value: string): string | null | undefined {
  const text = value.trim();
  if (!text) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return isRealIsoDate(text) ? text : null;
  }
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const iso = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return isRealIsoDate(iso) ? iso : null;
}

/**
 * The stored value a cell names: the exported label (what the file shows) or the stored value
 * itself (what a hand-filled sheet may hold). `undefined` when it names neither.
 */
export function resolveLabelledValue(
  value: string,
  labels: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
): string | undefined {
  const entries =
    labels instanceof Map
      ? [...labels.entries()]
      : Object.entries(labels as Record<string, string>);
  const lower = value.trim().toLocaleLowerCase();
  if (!lower) return undefined;
  const hit = entries.find(
    ([stored, label]) =>
      stored.toLocaleLowerCase() === lower ||
      label.toLocaleLowerCase() === lower,
  );
  return hit?.[0];
}
