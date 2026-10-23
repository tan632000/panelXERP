import { HttpException } from '@nestjs/common';

import {
  type BulkDeleteFailure,
  type BulkDeleteId,
  exceptionMessage,
} from '@shared/utils/bulk-delete.util';

/** What a bulk approval addresses a row by: a numeric key, a business code, or a composite. */
export type BulkApproveId = BulkDeleteId;

/**
 * One row the batch left unapproved, with the reason its own approval refused it. `status`
 * is the refusal's HTTP status, so a list can explain a row whose wording it does not map.
 */
export interface BulkApproveFailure<
  TId extends BulkApproveId = number,
> extends BulkDeleteFailure<TId> {
  status: number;
}

/** A row that was approved but left something the user must still act on. */
export interface BulkApproveWarning<TId extends BulkApproveId = number> {
  id: TId;
  /** Machine code the list maps to its own message, e.g. `returnHeld`. */
  code: string;
}

export interface BulkApproveResult<TId extends BulkApproveId = number> {
  /** Ids actually approved, in the order they were processed. */
  approved: TId[];
  failed: Array<BulkApproveFailure<TId>>;
  /** Present only when the caller asked for warnings and at least one row raised one. */
  warnings?: Array<BulkApproveWarning<TId>>;
}

export interface BulkApproveOptions<TOutcome> {
  /** Reads a warning code off what one approval returned; nothing means no warning. */
  warningOf?: (outcome: TOutcome) => string | undefined;
}

/**
 * Approves each ticked row through the resource's own single-row approval, and reports the
 * outcome per row instead of failing the whole batch.
 *
 * Reusing the single-row approval is the point: which step a row is at, whether this actor
 * may take it, and what the approval writes back are all decided there, and a batch must hold
 * to exactly the same rules as one row.
 *
 * Rows are approved one at a time, because an approval may read what the previous one wrote
 * (stock, balances, a parent status). A refusal (`HttpException` — a row at the wrong step,
 * no longer pending, or already gone) becomes a `failed` entry, so a selection holding one
 * row the actor may not approve still approves the rest. Anything else is a fault rather
 * than a verdict on that row, and is rethrown with the rows approved so far committed.
 */
export async function bulkApprove<
  TId extends BulkApproveId,
  TOutcome = unknown,
>(
  ids: TId[],
  approveOne: (id: TId) => Promise<TOutcome>,
  { warningOf }: BulkApproveOptions<TOutcome> = {},
): Promise<BulkApproveResult<TId>> {
  const result: BulkApproveResult<TId> = { approved: [], failed: [] };
  const warnings: Array<BulkApproveWarning<TId>> = [];

  // A repeated id would otherwise approve once and then report itself as not pending.
  for (const id of [...new Set(ids)]) {
    try {
      const outcome = await approveOne(id);
      result.approved.push(id);
      const code = warningOf?.(outcome);
      if (code) warnings.push({ id, code });
    } catch (error: unknown) {
      if (!(error instanceof HttpException)) throw error;
      result.failed.push({
        id,
        message: exceptionMessage(error),
        status: error.getStatus(),
      });
    }
  }

  if (warnings.length > 0) result.warnings = warnings;
  return result;
}
