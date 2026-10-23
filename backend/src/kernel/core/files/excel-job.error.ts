import { HttpException } from '@nestjs/common';

import { ExcelParseError } from '@shared/services/excel-parse.error';

import type { ExcelJobFailure } from '@kernel/core/files/excel-job.constants';
import type { ExcelParseIssue } from '@shared/services/excel-parse.error';

/** Codes a failed job may carry, besides the parser's own. */
const SPEC_ERROR_CODES = new Set(['invalidSpec', 'unknownField']);
/** Codes whose parse issues (fileRow/column detail) are kept on the job failure. */
const ISSUE_LIST_ERROR_CODES = new Set([
  'missingColumns',
  'duplicateColumn',
  'requiredMissing',
]);

/**
 * A job failure the client can act on. Bull keeps only an error's message as the job's
 * `failedReason`, so the message is the JSON of the failure itself.
 */
export class ExcelJobError extends Error {
  constructor(
    readonly code: string,
    readonly errors?: ExcelParseIssue[],
  ) {
    super(JSON.stringify(errors ? { code, errors } : { code }));
    this.name = 'ExcelJobError';
  }
}

/** Anything a job threw, as the failure it reports. Unexpected errors become `internal`. */
export function toExcelJobError(error: unknown): ExcelJobError {
  if (error instanceof ExcelJobError) return error;
  if (error instanceof ExcelParseError) {
    return new ExcelJobError(
      error.code,
      ISSUE_LIST_ERROR_CODES.has(error.code) ? error.issues : undefined,
    );
  }
  if (error instanceof HttpException) {
    const code = (error.getResponse() as { code?: unknown }).code;
    if (typeof code === 'string' && SPEC_ERROR_CODES.has(code)) {
      return new ExcelJobError(code);
    }
  }
  return new ExcelJobError('internal');
}

/** Reads a job's `failedReason` back into its failure. */
export function parseExcelJobFailure(
  reason: string | undefined,
): ExcelJobFailure {
  try {
    const parsed = JSON.parse(reason ?? '') as Partial<ExcelJobFailure>;
    if (typeof parsed.code === 'string') {
      return parsed.errors
        ? { code: parsed.code, errors: parsed.errors }
        : { code: parsed.code };
    }
  } catch {
    // A reason Bull wrote itself (a stalled job, say) is not JSON.
  }
  return { code: 'internal' };
}
