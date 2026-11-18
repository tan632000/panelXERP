import { QC_CHECKLIST_LOCK_KEY } from '@plugins/delivery/qc-checklist/constants/qc-checklist.constant';
import { QC_GUARD_NAME } from '@plugins/delivery/qc-inspection/constants/qc-inspection.constant';
import { QcInspectionController } from '@plugins/delivery/qc-inspection/qc-inspection.controller';
import { QcDefectService } from '@plugins/delivery/qc-inspection/services/qc-defect.service';
import { qcGuards } from '@plugins/delivery/qc-inspection/services/qc-guards';
import { QcInspectionService } from '@plugins/delivery/qc-inspection/services/qc-inspection.service';
import { QcNotifier } from '@plugins/delivery/qc-inspection/services/qc-notifier.service';
import {
  openHarnessWithProgress,
  releasedOrderWithOneFinishedUnit,
  type ProductionTestActor,
  type ProductionTestHarness,
} from '@plugins/production/_shared/finished-unit-kit.helper-spec';
import { ProductionGuardRegistry } from '@plugins/production/_shared/ports/production-guard.registry';

import type request from 'supertest';

/** A round body: one result per item id, `failing` ones with a note, `na` ones not applicable. */
export function roundBody(
  itemIds: readonly number[],
  { failing = [], na = [] }: { failing?: number[]; na?: number[] } = {},
) {
  return {
    results: itemIds.map((checklistItemId) =>
      failing.includes(checklistItemId)
        ? {
            checklistItemId,
            result: 'fail',
            note: `Defect on item ${checklistItemId}`,
          }
        : {
            checklistItemId,
            result: na.includes(checklistItemId) ? 'na' : 'pass',
          },
    ),
  };
}

export interface ReadyUnit {
  orderId: number;
  /** Production order id. */
  id: number;
  /** The cabinet whose `finishing` is done. */
  unitId: number;
  /** A second cabinet of the same production order, still unfinished. */
  otherUnitId: number;
}

export interface QcHarness {
  h: ProductionTestHarness;
  /** Ids of the active checklist template items, in template order. */
  itemIds(): Promise<number[]>;
  /** A released production order of two cabinets, the first finished (see the production kit). */
  readyUnit(): Promise<ReadyUnit>;
  round(unitId: number, body: object, as?: ProductionTestActor): request.Test;
  /**
   * Records a round on the active items as they are right now: other suites edit the shared
   * template too, so a list read earlier may be stale. `failing` and `na` are positions in that
   * list. Asserts the expected status; a 409 "checklist changed" means the template moved between
   * the read and the write, and the round is built again.
   */
  submit(
    unitId: number,
    results: { failing?: number[]; na?: number[] },
    as: ProductionTestActor,
    expected: number,
  ): Promise<request.Response>;
  /**
   * Runs `run` while no other suite can change the checklist template: it holds the template
   * advisory lock in shared mode, and the template writes take it exclusively. Use it where the
   * outcome depends on the active items staying put between reading them and the round.
   */
  withStableTemplate<T>(run: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * The production harness with the progress and QC features mounted and the QC guards registered,
 * the way the QC module registers them in the app. Named `*.helper-spec.ts` so the production
 * build leaves it out and jest does not run it as a test.
 */
export async function openQcHarness(): Promise<QcHarness> {
  const h = await openHarnessWithProgress([], {
    controllers: [QcInspectionController],
    providers: [QcInspectionService, QcDefectService, QcNotifier],
  });
  h.app.get(ProductionGuardRegistry).register(QC_GUARD_NAME, qcGuards);
  const touched: number[] = [];
  const itemIds = async () => {
    const rows: Array<{ id: number }> = await h.dataSource.query(
      `SELECT id FROM qc_checklist_items
        WHERE is_deleted = false AND active = true ORDER BY position, id`,
    );
    return rows.map((row) => row.id);
  };

  return {
    h,
    itemIds,
    async submit(unitId, results, as, expected) {
      for (let attempt = 1; ; attempt++) {
        const ids = await itemIds();
        const res = await h.post(
          `/delivery/qc/units/${unitId}/rounds`,
          roundBody(ids, {
            failing: (results.failing ?? []).map((position) => ids[position]),
            na: (results.na ?? []).map((position) => ids[position]),
          }),
          as,
        );
        const changed =
          res.status === 409 &&
          JSON.stringify(res.body).includes('checklist changed');
        if (changed && attempt < 5) continue;
        expect({ status: res.status, body: res.body as unknown }).toMatchObject(
          {
            status: expected,
          },
        );
        return res;
      }
    },
    async readyUnit() {
      const ready = await releasedOrderWithOneFinishedUnit(h);
      touched.push(ready.unitId, ready.otherUnitId);
      return ready;
    },
    async withStableTemplate(run) {
      const holder = h.dataSource.createQueryRunner();
      await holder.connect();
      try {
        await holder.query(`SELECT pg_advisory_lock_shared(hashtext($1))`, [
          QC_CHECKLIST_LOCK_KEY,
        ]);
        return await run();
      } finally {
        await holder.query(`SELECT pg_advisory_unlock_shared(hashtext($1))`, [
          QC_CHECKLIST_LOCK_KEY,
        ]);
        await holder.release();
      }
    },
    round: (unitId, body, as = 'qcInspector') =>
      h.post(`/delivery/qc/units/${unitId}/rounds`, body, as),
    async close() {
      if (touched.length > 0) {
        await h.dataSource.query(
          `DELETE FROM notifications
            WHERE event_type LIKE 'qc.unit.%' AND (payload->>'unitId')::int = ANY($1)`,
          [touched],
        );
        await h.dataSource.query(
          `DELETE FROM qc_defects WHERE unit_id = ANY($1)`,
          [touched],
        );
        await h.dataSource.query(
          `DELETE FROM qc_round_items
            WHERE round_id IN (SELECT id FROM qc_rounds WHERE unit_id = ANY($1))`,
          [touched],
        );
        await h.dataSource.query(
          `DELETE FROM qc_rounds WHERE unit_id = ANY($1)`,
          [touched],
        );
      }
      await h.close();
    },
  };
}
