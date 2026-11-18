import {
  openProductionHarness,
  type ActorName,
  type ProductionHarness,
} from '@plugins/production/production-order/production-db.helper-spec';
import {
  releasedOrder,
  runStages,
} from '@plugins/production/progress/progress-db.helper-spec';
import { ProgressController } from '@plugins/production/progress/progress.controller';
import { ProgressQueryService } from '@plugins/production/progress/services/progress-query.service';
import { ProgressService } from '@plugins/production/progress/services/progress.service';

import type { ModuleMetadata } from '@nestjs/common';

/**
 * What the specs of a plugin that builds on a finished cabinet (QC, delivery) may use of
 * production's test wiring. Other plugins' lint rule keeps them out of production's internals, so
 * production offers the harness and the finished-cabinet fixture from `_shared`. Named
 * `*.helper-spec.ts` so the production build leaves it out and jest does not run it as a test.
 */
export type ProductionTestHarness = ProductionHarness;
export type ProductionTestActor = ActorName;

/** The production harness with the stage-tracking feature mounted beside the caller's own. */
export function openHarnessWithProgress(
  foreignEntities: Parameters<typeof openProductionHarness>[0],
  extras: Pick<ModuleMetadata, 'controllers' | 'providers'> = {},
): Promise<ProductionHarness> {
  return openProductionHarness(foreignEntities, {
    controllers: [ProgressController, ...(extras.controllers ?? [])],
    providers: [
      ProgressService,
      ProgressQueryService,
      ...(extras.providers ?? []),
    ],
  });
}

/**
 * A released production order of two cabinets of one order, the first finished through all six
 * stages. The second stays open, so the production order stays released and its finishing undo
 * and its cancel can still be tried.
 */
export async function releasedOrderWithOneFinishedUnit(
  h: ProductionHarness,
): Promise<{
  orderId: number;
  /** Production order id. */
  id: number;
  unitId: number;
  otherUnitId: number;
}> {
  const order = await releasedOrder(h, 2);
  const [first, second] = order.units;
  await runStages(h, first.id);
  return {
    orderId: order.orderId,
    id: order.id,
    unitId: first.id,
    otherUnitId: second.id,
  };
}
