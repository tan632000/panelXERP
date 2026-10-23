import type { ExcelSheetSpecDto } from '@shared/dto/excel-sheet-spec.dto';
import type { ExcelParseIssue } from '@shared/services/excel-parse.error';
import type { ExcelParsedRow } from '@shared/services/excel-sheet.parser';

export const EXCEL_QUEUE = 'excel';
export const EXCEL_EXPORT_JOB = 'export';
export const EXCEL_PARSE_JOB = 'parse';
export const EXCEL_CLEANUP_JOB = 'cleanup';

/** Jobs of each kind one backend instance runs at once. */
export const EXCEL_JOB_CONCURRENCY = 2;

/** Export and parse jobs one user may have waiting or running at once. */
export const EXCEL_MAX_OPEN_JOBS_PER_USER = 3;

/** How long a finished job stays readable in Redis, in seconds. Outlives the download window. */
export const EXCEL_JOB_RETENTION_SECONDS = 3600;

/** How long an export zip stays downloadable after it is ready, in milliseconds. */
export const EXCEL_DOWNLOAD_TTL_MS = 30 * 60 * 1000;

export const EXCEL_SSE_HEARTBEAT_MS = 15_000;

export const EXCEL_EXPORT_KEY_PREFIX = 'excel-exports';
export const EXCEL_IMPORT_KEY_PREFIX = 'excel-imports';

/** Redis key prefix for the ZSET tracking one user's open (waiting/active) job ids. */
export const EXCEL_OPEN_JOBS_KEY_PREFIX = 'excel:open-jobs';

/** Redis key prefix for the one-shot claim a download takes on an export's zip. */
export const EXCEL_DOWNLOAD_CLAIM_KEY_PREFIX = 'excel:download-claim';

export const EXCEL_ZIP_CONTENT_TYPE = 'application/zip';

/** File names are built by the client from plain characters; the server adds the extension. */
export const EXCEL_FILE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export type ExcelJobKind = 'export' | 'parse';

interface ExcelJobBase {
  userId: number;
  label: string;
  /** Epoch milliseconds the request was accepted. */
  createdAt: number;
}

/** One worksheet of a multi-sheet export job: the source row set it writes, and its layout. */
export interface ExcelExportSheetEntry {
  key: string;
  sheet: ExcelSheetSpecDto;
}

export interface ExcelExportJobData extends ExcelJobBase {
  kind: 'export';
  sourceKey: string;
  query: Record<string, unknown>;
  /** The single worksheet of a list export; absent on a multi-sheet export. */
  sheet?: ExcelSheetSpecDto;
  /** Every worksheet of a multi-sheet export, in order; its source is a multi-sheet one. */
  sheets?: ExcelExportSheetEntry[];
  fileName: string;
  /** What the feature route decided at request time, e.g. whether prices may be read. */
  context: Record<string, unknown>;
  /** Epoch milliseconds of the first completed download; the file is gone after it. */
  downloadedAt?: number;
}

export interface ExcelParseJobData extends ExcelJobBase {
  kind: 'parse';
  sheet: ExcelSheetSpecDto;
  s3Key: string;
}

export interface ExcelCleanupJobData {
  kind: 'cleanup';
  s3Key: string;
}

export type ExcelJobData =
  ExcelExportJobData | ExcelParseJobData | ExcelCleanupJobData;

export interface ExcelExportJobResult {
  kind: 'export';
  fileName: string;
  sizeBytes: number;
  /** Epoch milliseconds the zip was ready; the download window starts here. */
  completedAt: number;
  expiresAt: number;
  s3Key: string;
}

export interface ExcelParseJobResult {
  kind: 'parse';
  rowCount: number;
  rows: ExcelParsedRow[];
  /** Non-fatal, row-level issues found while reading (currently only `requiredMissing`). */
  issues?: ExcelParseIssue[];
}

export interface ExcelJobProgress {
  stage: string;
  percent: number;
}

export type ExcelJobState = 'waiting' | 'active' | 'completed' | 'failed';

export interface ExcelJobFailure {
  code: string;
  errors?: ExcelParseIssue[];
}

/** What a client may see of a job (contract C6); never the S3 key or the parsed rows. */
export interface ExcelJobSnapshot {
  id: string;
  kind: ExcelJobKind;
  label: string;
  state: ExcelJobState;
  stage: string;
  percent: number;
  result?:
    | {
        fileName: string;
        sizeBytes: number;
        expiresAt: string;
        downloaded: boolean;
      }
    | { rowCount: number; issues?: ExcelParseIssue[] };
  error?: ExcelJobFailure;
}
