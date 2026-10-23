export const EXCEL_PARSE_ERROR_CODES = [
  'missingColumns',
  'duplicateColumn',
  'invalidFile',
  'emptyFile',
  'tooManyRows',
  'requiredMissing',
] as const;
export type ExcelParseErrorCode = (typeof EXCEL_PARSE_ERROR_CODES)[number];

/** One problem found in an uploaded sheet, located by its 1-based sheet row. */
export interface ExcelParseIssue {
  fileRow: number;
  code: ExcelParseErrorCode;
  column?: string;
}

/**
 * Why a sheet could not be read. Header problems are all collected into one error, so the
 * reader can fix the file once instead of discovering one missing column per upload.
 */
export class ExcelParseError extends Error {
  constructor(
    readonly code: ExcelParseErrorCode,
    readonly issues: ExcelParseIssue[] = [{ fileRow: 1, code }],
  ) {
    super(`Excel sheet rejected: ${code}`);
    this.name = 'ExcelParseError';
  }
}
