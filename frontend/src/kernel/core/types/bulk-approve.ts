import type {
  BulkDeleteFailure,
  BulkDeleteId,
} from "@/kernel/core/types/bulk-delete";

/** What a bulk approval addresses a row by: a numeric key, a business code, or a composite. */
export type BulkApproveId = BulkDeleteId;

/**
 * One row a bulk approval left unapproved, with the reason its own approval refused it.
 * `status` is the refusal's HTTP status, which explains a row whose wording is not mapped.
 */
export interface BulkApproveFailure<
  TId extends BulkApproveId = number,
> extends BulkDeleteFailure<TId> {
  status?: number;
}

/** A row that was approved but left something the user must still act on. */
export interface BulkApproveWarning<TId extends BulkApproveId = number> {
  id: TId;
  /** Machine code the list maps to its own message, e.g. `returnHeld`. */
  code: string;
}

/**
 * Outcome of one bulk approval, reported per row: a selection holding a row at another step,
 * or one this actor may not approve, still approves the rest.
 */
export interface BulkApproveResult<TId extends BulkApproveId = number> {
  approved: TId[];
  failed: Array<BulkApproveFailure<TId>>;
  warnings?: Array<BulkApproveWarning<TId>>;
}
