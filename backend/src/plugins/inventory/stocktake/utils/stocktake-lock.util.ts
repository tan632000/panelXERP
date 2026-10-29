import { ConflictException, NotFoundException } from '@nestjs/common';

import { STOCKTAKE_LABEL } from '@plugins/inventory/stocktake/constants/stocktake.constant';

import type { StocktakeStatus } from '@plugins/inventory/stocktake/enums/stocktake.enum';
import type { EntityManager } from 'typeorm';

/** The header as a decision reads it under its lock. */
export interface LockedStocktake {
  id: number;
  code: string;
  status: StocktakeStatus;
  createdBy: number | null;
  submitterIds: number[];
}

/** The header `FOR UPDATE` for the rest of the transaction; 404 when missing. */
export async function lockStocktake(
  manager: EntityManager,
  id: number,
): Promise<LockedStocktake> {
  const [row]: Array<{
    id: number;
    code: string;
    status: StocktakeStatus;
    created_by: number | null;
    submitter_ids: number[] | null;
  }> = await manager.query(
    `SELECT id, code, status, created_by, submitter_ids FROM stocktakes
      WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!row) throw new NotFoundException(`${STOCKTAKE_LABEL} not found`);
  return {
    id: Number(row.id),
    code: row.code,
    status: row.status,
    createdBy: row.created_by === null ? null : Number(row.created_by),
    submitterIds: (row.submitter_ids ?? []).map(Number),
  };
}

export function assertStocktakeStatus(
  stocktake: LockedStocktake,
  allowed: readonly StocktakeStatus[],
  action: string,
): void {
  if (!allowed.includes(stocktake.status)) {
    throw new ConflictException(
      `${STOCKTAKE_LABEL} ${stocktake.code} is ${stocktake.status} and cannot be ${action}.`,
    );
  }
}

/**
 * Moves the count only if it still has the status this transaction read under the lock.
 * `assignments` are trusted SQL fragments over `$3…`, `values` their parameters.
 */
export async function moveStocktake(
  manager: EntityManager,
  stocktake: LockedStocktake,
  to: StocktakeStatus,
  assignments: string[] = [],
  values: unknown[] = [],
): Promise<void> {
  const set = ['status = $2', 'updated_at = NOW()', ...assignments].join(', ');
  const result: [unknown[], number] = await manager.query(
    `UPDATE stocktakes SET ${set} WHERE id = $1 AND status = $${3 + values.length}`,
    [stocktake.id, to, ...values, stocktake.status],
  );
  if (result[1] !== 1) {
    throw new ConflictException(
      `${STOCKTAKE_LABEL} ${stocktake.code} changed while it was being moved to ${to}.`,
    );
  }
}
