/** The six fixed stages of a cabinet, in the order they run. */
export enum ProductionStage {
  MATERIAL_PREP = 'material_prep',
  ENCLOSURE = 'enclosure',
  DEVICE_MOUNTING = 'device_mounting',
  WIRING = 'wiring',
  INTERNAL_TEST = 'internal_test',
  FINISHING = 'finishing',
}

export const PRODUCTION_STAGES: readonly ProductionStage[] = [
  ProductionStage.MATERIAL_PREP,
  ProductionStage.ENCLOSURE,
  ProductionStage.DEVICE_MOUNTING,
  ProductionStage.WIRING,
  ProductionStage.INTERNAL_TEST,
  ProductionStage.FINISHING,
];

export enum ProductionStageStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}
