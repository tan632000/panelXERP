import {
  PRODUCTION_STAGES,
  type ProductionStage,
} from '@plugins/production/production-order/enums/production-stage.enum';
import {
  openProductionHarness,
  type ActorName,
  type ProductionHarness,
} from '@plugins/production/production-order/production-db.helper-spec';
import { ProgressController } from '@plugins/production/progress/progress.controller';
import { ProgressQueryService } from '@plugins/production/progress/services/progress-query.service';
import { ProgressService } from '@plugins/production/progress/services/progress.service';

/**
 * The production harness with the progress feature mounted, and the steps every progress spec
 * repeats. Named `*.helper-spec.ts` so the production build leaves it out and jest does not run
 * it as a test.
 */
export function openProgressHarness(): Promise<ProductionHarness> {
  return openProductionHarness([], {
    controllers: [ProgressController],
    providers: [ProgressService, ProgressQueryService],
  });
}

export const stagePath = (
  unitId: number,
  stage: ProductionStage,
  action: 'start' | 'finish' | 'undo',
) => `/production/units/${unitId}/stages/${stage}/${action}`;

/** A released production order whose cabinets all belong to the technician. */
export async function releasedOrder(
  h: ProductionHarness,
  quantity = 1,
  technician: ActorName = 'techA',
) {
  const orderId = await h.newOrder({ panels: [{ tag: 'MSB', quantity }] });
  const created = await h.createProduction(orderId).expect(201);
  const id = (created.body as { id: number }).id;
  await h.prepare(id, technician);
  await h.post(`/production/orders/${id}/release`, {}).expect(200);
  return { orderId, id, units: await h.units(id) };
}

/** Starts and finishes the stages in order; with `startLast`, leaves the last one started. */
export async function runStages(
  h: ProductionHarness,
  unitId: number,
  stages: readonly ProductionStage[] = PRODUCTION_STAGES,
  as: ActorName = 'techA',
  startLast = false,
): Promise<void> {
  for (const [index, stage] of stages.entries()) {
    await h.post(stagePath(unitId, stage, 'start'), {}, as).expect(200);
    if (startLast && index === stages.length - 1) return;
    await h.post(stagePath(unitId, stage, 'finish'), {}, as).expect(200);
  }
}
