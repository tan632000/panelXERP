import { ConflictException } from '@nestjs/common';

import type { ProductionGuardHandlers } from '@plugins/production/_shared/ports/production-guard.registry';

/**
 * What a QC round forbids production to do. Both run inside production's transaction after its
 * locks, so a round recorded meanwhile either committed before (the guard sees it) or waits
 * behind the cabinet lock until production's change committed (the round then answers 409).
 */
export const qcGuards: ProductionGuardHandlers = {
  async beforeFinishingUndo(manager, unitId) {
    const rounds: unknown[] = await manager.query(
      `SELECT 1 FROM qc_rounds WHERE unit_id = $1 AND is_deleted = false LIMIT 1`,
      [unitId],
    );
    if (rounds.length > 0) {
      throw new ConflictException(
        'The cabinet has a QC round, so its finishing stage cannot be undone.',
      );
    }
  },

  async beforeCancel(manager, productionOrderId) {
    const rounds: unknown[] = await manager.query(
      `SELECT 1
         FROM qc_rounds r
         JOIN production_units u ON u.id = r.unit_id
        WHERE u.production_order_id = $1 AND r.is_deleted = false
        LIMIT 1`,
      [productionOrderId],
    );
    if (rounds.length > 0) {
      throw new ConflictException(
        'A cabinet of this production order has a QC round, so it cannot be cancelled.',
      );
    }
  },
};
