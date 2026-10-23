import { HttpException } from '@nestjs/common';

/**
 * What a list identifies its rows by. Numeric for a surrogate primary key, string for a
 * resource addressed by its business code (a subcontract order is `GC-NVL-2026-0001`).
 */
export type BulkDeleteId = number | string;

/** One row the batch left in place, with the reason its own delete refused it. */
export interface BulkDeleteFailure<TId extends BulkDeleteId = number> {
  id: TId;
  message: string;
}

export interface BulkDeleteResult<TId extends BulkDeleteId = number> {
  /** Ids actually soft-deleted, in the order they were processed. */
  deleted: TId[];
  failed: Array<BulkDeleteFailure<TId>>;
}

/**
 * Deletes each ticked row through the resource's own single-row delete, and reports the
 * outcome per row instead of failing the whole batch.
 *
 * Reusing `remove` is the point: every resource refuses a delete for its own reasons — a
 * company still referenced by an order, a material still used by a product — and those
 * guards must hold for a batch exactly as they do for one row. Restating them here would
 * let the two drift apart.
 *
 * Rows are deleted one at a time because a guard reads the tables the previous delete just
 * wrote; running them together would let two rows each pass a check the other invalidates.
 * A refusal (`HttpException`, e.g. the 400 a constraint raises, or a 404 for a row a
 * concurrent session already deleted) becomes a `failed` entry, so a selection holding one
 * blocked row still deletes the rest. Anything else is a fault rather than a verdict on
 * that row, and is rethrown with the ids deleted so far already committed.
 */
export async function bulkSoftDelete<TId extends BulkDeleteId>(
  ids: TId[],
  removeOne: (id: TId) => Promise<unknown>,
): Promise<BulkDeleteResult<TId>> {
  const result: BulkDeleteResult<TId> = { deleted: [], failed: [] };

  // A repeated id would otherwise delete once and then report itself as not found.
  for (const id of [...new Set(ids)]) {
    try {
      await removeOne(id);
      result.deleted.push(id);
    } catch (error: unknown) {
      if (!(error instanceof HttpException)) throw error;
      result.failed.push({ id, message: exceptionMessage(error) });
    }
  }

  return result;
}

/** The human-readable half of a Nest exception body, which may be a string or an object. */
export function exceptionMessage(error: HttpException): string {
  const response: unknown = error.getResponse();

  if (typeof response === 'string') return response;

  if (
    typeof response === 'object' &&
    response !== null &&
    'message' in response
  ) {
    const { message } = response;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map(String).join(', ');
  }

  return error.message;
}
