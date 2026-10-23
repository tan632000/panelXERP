/** Most columns one sheet spec may describe. */
export const EXCEL_MAX_COLUMNS = 100;

/** Deepest header group nesting a column may declare, outermost group first. */
export const EXCEL_MAX_HEADER_GROUP_DEPTH = 3;

/** Most row fields one column may combine into a single cell. */
export const EXCEL_MAX_FIELDS_PER_COLUMN = 5;

/** Most entries one field's `valueLabels` map may hold. */
export const EXCEL_MAX_VALUE_LABELS = 200;

/**
 * Most rows one export may write. Checked before the workbook is built, so an export over the
 * limit fails outright instead of being silently truncated.
 */
export const EXCEL_EXPORT_MAX_ROWS = 50_000;

/** Most worksheets one multi-sheet export may write. */
export const EXCEL_MAX_SHEETS = 10;

/** Most data rows one import may read; reading stops as soon as the limit is crossed. */
export const EXCEL_IMPORT_MAX_ROWS = 10_000;

/**
 * Most raw sheet rows an import reader will step through (data and blank alike) before giving
 * up, so a sheet with a styled cell far down (e.g. row 1,048,576) cannot force the reader to
 * spin through a million rows just to find them empty.
 */
export const EXCEL_IMPORT_ROW_CEILING = 200_000;

/**
 * Most total declared-uncompressed bytes an uploaded workbook's zip entries may claim,
 * checked from the zip's central directory before any entry is decompressed. A declared size
 * can still be forged, so this is defense in depth alongside `EXCEL_IMPORT_ROW_CEILING`, not a
 * guarantee on its own. 100 MB comfortably covers a legitimate import at the row and column
 * caps (`EXCEL_IMPORT_MAX_ROWS`, `EXCEL_MAX_COLUMNS`) while still refusing a zip bomb's
 * disproportionate claimed size.
 */
export const EXCEL_IMPORT_MAX_DECOMPRESSED_BYTES = 100 * 1024 * 1024;

/**
 * Most bytes the merge scan reads from a worksheet's decompressed XML before giving up on
 * merged-cell support for that file. `mergeCell` elements are tiny; a file whose sheet
 * decompresses past this without them just parses without merged-cell matching instead of
 * scanning arbitrarily far to look for one.
 */
export const EXCEL_IMPORT_MERGE_SCAN_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Most merge ranges (header and data) the bounded scan keeps before refusing the import
 * outright. Kept ranges fill in header labels and, for a vertical (`groupSpan`) merge, real
 * data-cell values — losing track of one past this point would silently drop or mismatch data
 * rather than just cosmetic header formatting, so the import is rejected as `invalidFile`
 * instead of guessed at. Each data merge spans at least 2 rows, so one merge per row pair is
 * already the extreme case for `EXCEL_IMPORT_MAX_ROWS` data rows; doubling that leaves headroom.
 */
export const EXCEL_IMPORT_MAX_MERGE_RANGES = EXCEL_IMPORT_MAX_ROWS * 2;

/** Largest import upload accepted, in bytes. */
export const EXCEL_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Most `requiredMissing` issues collected before the parser stops adding more, so a sheet
 * missing values on every row cannot make the failed job's error list unbounded.
 */
export const EXCEL_IMPORT_MAX_REQUIRED_ISSUES = 200;

/** Display format of every date cell the kernel writes. */
export const EXCEL_DATE_FORMAT = 'dd/mm/yyyy';

/** Column width used when a column spec declares none, in Excel character units. */
export const EXCEL_DEFAULT_COLUMN_WIDTH = 16;

export const EXCEL_XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Workbook author metadata — the deployment's display name, never a hard-coded customer. */
export function excelWorkbookCreator(): string {
  return process.env.APP_DISPLAY_NAME || 'ERP Platform';
}
