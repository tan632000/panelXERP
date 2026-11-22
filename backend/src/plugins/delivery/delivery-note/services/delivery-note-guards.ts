import { ConflictException } from '@nestjs/common';

import { DeliveryNoteStatus } from '@plugins/delivery/delivery-note/constants/delivery-note.constant';

import type { ProductionGuardHandlers } from '@plugins/production/_shared/ports/production-guard.registry';

const ON_LIVE_NOTE = `FROM delivery_note_units du
        JOIN delivery_notes n ON n.id = du.note_id
       WHERE du.is_deleted = false AND n.is_deleted = false
         AND n.status <> '${DeliveryNoteStatus.CANCELLED}'`;

/**
 * What a delivery note forbids production to do, whatever QC says: a cabinet on a note that is
 * not cancelled (draft, shipped or received) keeps its finishing stage and its production order.
 * Both run inside production's transaction after its locks, and a note is created under the same
 * cabinet locks, so a note committed before is seen here and one created later waits for the
 * production change before it reads the cabinet.
 */
export const deliveryNoteGuards: ProductionGuardHandlers = {
  async beforeFinishingUndo(manager, unitId) {
    const lines: unknown[] = await manager.query(
      `SELECT 1 ${ON_LIVE_NOTE} AND du.unit_id = $1 LIMIT 1`,
      [unitId],
    );
    if (lines.length > 0) {
      throw new ConflictException(
        'The cabinet is on a delivery note, so its finishing stage cannot be undone.',
      );
    }
  },

  async beforeCancel(manager, productionOrderId) {
    const lines: unknown[] = await manager.query(
      `SELECT 1 ${ON_LIVE_NOTE}
          AND du.unit_id IN (SELECT id FROM production_units WHERE production_order_id = $1)
        LIMIT 1`,
      [productionOrderId],
    );
    if (lines.length > 0) {
      throw new ConflictException(
        'A cabinet of this production order is on a delivery note, so it cannot be cancelled.',
      );
    }
  },
};
