import type { DataSource, EntityManager } from 'typeorm';

/**
 * Anything that can run the preview query. Accepting an `EntityManager` as well as a
 * `DataSource` is what lets a caller allocate a code *inside* its own transaction: a
 * `DataSource` query runs on another connection and cannot see the rows the transaction has
 * already inserted, so two codes allocated in one transaction come back identical.
 */
export type CodePreviewRunner = Pick<DataSource, 'query'> | EntityManager;

export interface MaxBasedCodeOptions {
  /** Physical table name (alphanumeric + underscore only). */
  table: string;
  /** Code prefix including separator, e.g. `VT_`, `HC_`, `CCDC_`. */
  prefix: string;
  /** Zero-pad width for the numeric suffix (default 4). */
  padLength?: number;
  /** Column storing the code value (default `code`). */
  column?: string;
  /**
   * Count soft-deleted rows as taken. Off by default: a deleted record frees its
   * number again, so deleting the highest record hands the same code to the next one.
   */
  includeDeleted?: boolean;
}

function assertSafeSqlIdent(value: string, label: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid ${label} for max-based code preview: ${value}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Preview next MAX-based code (does NOT advance a sequence).
 * Reads the highest live code, so numbers freed by a delete are handed out again —
 * an emptied table restarts at `PREFIX_0001`.
 */
export async function previewMaxBasedCode(
  dataSource: CodePreviewRunner,
  options: MaxBasedCodeOptions,
): Promise<string> {
  assertSafeSqlIdent(options.table, 'table');

  const padLength = options.padLength ?? 4;
  const column = options.column ?? 'code';
  assertSafeSqlIdent(column, 'column');
  const prefix = options.prefix;
  const regex = `^${escapeRegExp(prefix)}[0-9]{${padLength},}$`;

  const activeOnly = options.includeDeleted
    ? ''
    : `
       AND is_deleted = false`;

  const result: Array<{ code: string }> = await dataSource.query(
    `SELECT ${column} AS code FROM ${options.table}
     WHERE ${column} ~ $1${activeOnly}
     ORDER BY (substring(${column} from '[0-9]+$'))::int DESC
     LIMIT 1`,
    [regex],
  );

  if (result.length === 0) {
    return `${prefix}${String(1).padStart(padLength, '0')}`;
  }

  return nextPrefixedNumericCode(result[0].code, prefix, padLength);
}

/**
 * Increment a prefixed numeric code, keeping the current suffix width
 * (at least `padLength`) so `FG_000733123` becomes `FG_000733124`.
 */
export function nextPrefixedNumericCode(
  currentCode: string,
  prefix: string,
  padLength = 4,
): string {
  if (!currentCode.startsWith(prefix)) {
    return `${prefix}${String(1).padStart(padLength, '0')}`;
  }

  const numericPart = currentCode.slice(prefix.length);
  const nextNumber = parseInt(numericPart, 10) + 1;
  const width = Math.max(padLength, numericPart.length);
  return `${prefix}${String(nextNumber).padStart(width, '0')}`;
}

export interface YearScopedCodeOptions {
  /** Physical table name (alphanumeric + underscore only). */
  table: string;
  /** Prefix without separator, e.g. `R`. */
  prefix: string;
  /** Year segment of the code, e.g. `2026`. */
  year: number;
  /** Zero-pad width for the ordinal (default 4). */
  padLength?: number;
  /** Column storing the code value (default `code`). */
  column?: string;
  /** Count soft-deleted rows as taken (default true: a document number stays reserved). */
  includeDeleted?: boolean;
}

/**
 * Preview the next code for a document numbered per year: `R_2026_0049` — prefix, year,
 * zero-padded ordinal. The ordinal is the highest one already used in that year plus
 * one, read from the documents themselves, so no sequence table is involved and every
 * year restarts at `0001`.
 */
export async function previewYearScopedCode(
  dataSource: CodePreviewRunner,
  options: YearScopedCodeOptions,
): Promise<string> {
  return previewMaxBasedCode(dataSource, {
    table: options.table,
    column: options.column,
    prefix: `${options.prefix}_${options.year}_`,
    padLength: options.padLength ?? 4,
    includeDeleted: options.includeDeleted ?? true,
  });
}
