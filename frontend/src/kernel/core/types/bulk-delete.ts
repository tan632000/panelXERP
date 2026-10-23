/**
 * What a list identifies its rows by. Numeric for a surrogate primary key, string for a
 * resource addressed by its business code (a subcontract order is `GC-NVL-2026-0001`).
 */
export type BulkDeleteId = number | string;

/** One row a bulk delete left in place, with the reason its own delete refused it. */
export interface BulkDeleteFailure<TId extends BulkDeleteId = number> {
  id: TId;
  message: string;
}

/**
 * Outcome of one bulk delete, reported per row: a selection holding a row some guard
 * refuses still deletes the rest, so the list needs both halves to tell the user what
 * happened.
 */
export interface BulkDeleteResult<TId extends BulkDeleteId = number> {
  deleted: TId[];
  failed: Array<BulkDeleteFailure<TId>>;
}
