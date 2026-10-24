import { saveWithGeneratedCode } from '@shared/utils/db-error.util';
import { previewYearScopedCode } from '@shared/utils/max-based-code.util';

import type { DataSource, EntityManager } from 'typeorm';

/** The business day a document number is issued on follows the shop's clock, not UTC. */
export const SALES_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** The calendar year `now` falls in at the shop: 17:30 UTC on 31 December is already next year. */
export function salesDocumentYear(now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SALES_TIME_ZONE,
      year: 'numeric',
    }).format(now),
  );
}

/** Everything a code format needs to read the numbers already issued and produce the next. */
export interface DocumentCodeContext {
  /** The transaction the document is created in, so the read sees its own earlier inserts. */
  manager: EntityManager;
  table: string;
  /** Prefix without separator, e.g. `YC`. */
  prefix: string;
  now: Date;
}

/**
 * How a document's number is built. The yearly `PREFIX_YYYY_NNNN` format is the only one so
 * far; a document numbered per day (`NN-ddmmyyyy/BG`) supplies its own format here, and the
 * retry and transaction handling stay as they are.
 */
export type DocumentCodeFormat = (
  context: DocumentCodeContext,
) => Promise<string>;

/**
 * `PREFIX_YYYY_NNNN`: the highest number used in the year plus one, deleted rows counted so a
 * number stays reserved. Every year restarts at `0001`.
 */
export const yearlyDocumentCode: DocumentCodeFormat = ({
  manager,
  table,
  prefix,
  now,
}) =>
  previewYearScopedCode(manager, {
    table,
    prefix,
    year: salesDocumentYear(now),
    includeDeleted: true,
  });

export interface CreateWithDocumentCodeOptions {
  table: string;
  /** Prefix without separator, e.g. `YC`. */
  prefix: string;
  /** Unique index over the code; losing a race on it is what triggers another attempt. */
  codeUniqueIndex: string;
  /** Message of the 409 once every attempt lost the race. */
  exhaustedMessage: string;
  format?: DocumentCodeFormat;
  /** Injectable clock; defaults to the system time. */
  clock?: () => Date;
  maxAttempts?: number;
}

/** Concurrent creates each need a fresh attempt after the one ahead of them commits. */
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Creates a numbered document: opens a transaction, reads the next code inside it and hands
 * both to `txWork`. The number comes from the rows already stored, so two creates running
 * together read the same one and the second insert fails on the unique index — which discards
 * that whole transaction and runs it again on a fresh read, rather than retrying the insert
 * against a connection whose transaction Postgres has already aborted.
 *
 * `txWork` must write only through the manager it is given, so that a failed attempt leaves
 * nothing behind. Do not run side effects (notifications, uploads) inside it: it can run more
 * than once.
 */
export function createWithDocumentCode<T>(
  dataSource: Pick<DataSource, 'transaction'>,
  options: CreateWithDocumentCodeOptions,
  txWork: (manager: EntityManager, code: string) => Promise<T>,
): Promise<T> {
  const format = options.format ?? yearlyDocumentCode;
  const clock = options.clock ?? (() => new Date());

  return saveWithGeneratedCode(
    () =>
      dataSource.transaction(async (manager) => {
        const code = await format({
          manager,
          table: options.table,
          prefix: options.prefix,
          now: clock(),
        });
        return txWork(manager, code);
      }),
    {
      retryOn: [options.codeUniqueIndex.toLowerCase()],
      exhaustedMessage: options.exhaustedMessage,
      maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    },
  );
}
