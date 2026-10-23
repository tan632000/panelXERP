/**
 * The Excel contracts shared with the backend kernel (spec contracts C1 and C6). Field names
 * and limits mirror `ExcelSheetSpecDto` and `ExcelJobSnapshot`; change both sides together.
 */

export type ExcelFieldType = "text" | "number" | "date";

/** One row field a column reads, and how its raw value is written. */
export interface ExcelFieldRef {
  field: string;
  type?: ExcelFieldType;
  /** Display label per stored value, e.g. the translated label of an enum member. */
  valueLabels?: Record<string, string>;
}

/**
 * How a table column's value is written to a cell. Needed because a column's `render`
 * returns a React node, which cannot be sent to the server.
 */
export interface ExcelColumnValue {
  /** Row fields to read; defaults to the column key. */
  fields?: ExcelFieldRef[];
  /** How several fields become one cell; `join` by default. */
  combine?: "join" | "coalesce";
  joinWith?: string;
  /** Excel number format for a single numeric field, e.g. `#,##0.00`. */
  numberFormat?: string;
}

export interface ExcelColumnSpec extends ExcelColumnValue {
  key: string;
  label: string;
  headerGroup?: string[];
  groupSpan?: boolean;
  width?: number;
  /** Whether this column must hold a value on every import row. */
  required?: boolean;
}

export interface ExcelSheetSpec {
  columns: ExcelColumnSpec[];
  rowGroupField?: string;
  sheetName?: string;
}

/** One worksheet of a multi-sheet export: the source row set it writes, and its layout. */
export interface ExcelSheetEntry {
  key: string;
  sheet: ExcelSheetSpec;
}

export type ExcelJobKind = "export" | "parse";
export type ExcelJobState = "waiting" | "active" | "completed" | "failed";

export interface ExcelJobProgress {
  stage: string;
  percent: number;
}

export interface ExcelExportResult {
  fileName: string;
  sizeBytes: number;
  /** ISO-8601 UTC instant after which the file can no longer be downloaded. */
  expiresAt: string;
  downloaded: boolean;
}

export interface ExcelParseResult {
  rowCount: number;
  /** Non-fatal, row-level issues found while reading (currently only `requiredMissing`); the
   * parse still completed and every row is available through the result route. */
  issues?: ExcelImportError[];
}

/** One problem found in an uploaded sheet, located by its 1-based sheet row. */
export interface ExcelImportError {
  fileRow: number;
  code: string;
  column?: string;
}

export interface ExcelJobFailure {
  code: string;
  errors?: ExcelImportError[];
}

export interface ExcelJobSnapshot extends ExcelJobProgress {
  id: string;
  kind: ExcelJobKind;
  label: string;
  state: ExcelJobState;
  result?: ExcelExportResult | ExcelParseResult;
  error?: ExcelJobFailure;
}

/** One data row of an import, keyed by the spec's column keys. */
export interface ExcelImportRow {
  fileRow: number;
  values: Record<string, string>;
}
