import type {
  ProductionStage,
  StageAction,
} from "@plugins/production/progress/constants";
import type { UnitProgress } from "@plugins/production/progress/types";

/**
 * The one control each stage may offer, mirroring what the server accepts: only while the
 * production order is released; start the first stage that is pending after a done one; finish
 * the stage in progress; undo the latest done stage whose next stage is still pending.
 */
export function stageActions(
  unit: UnitProgress,
  can: { update: boolean; undo: boolean },
): Partial<Record<ProductionStage, StageAction>> {
  const actions: Partial<Record<ProductionStage, StageAction>> = {};
  if (unit.productionOrderStatus !== "released") return actions;

  unit.stages.forEach((stage, index) => {
    const before = unit.stages[index - 1];
    const after = unit.stages[index + 1];
    if (stage.status === "pending") {
      if (can.update && (!before || before.status === "done")) {
        actions[stage.stage] = "start";
      }
    } else if (stage.status === "in_progress") {
      if (can.update) actions[stage.stage] = "finish";
    } else if (can.undo && (!after || after.status === "pending")) {
      actions[stage.stage] = "undo";
    }
  });
  return actions;
}
