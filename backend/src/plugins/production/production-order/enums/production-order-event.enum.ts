/** What a production order's history records. */
export enum ProductionOrderEventType {
  CREATED = 'created',
  RELEASED = 'released',
  CANCELLED = 'cancelled',
  UNIT_UPDATED = 'unit_updated',
  STAGE_STARTED = 'stage_started',
  STAGE_FINISHED = 'stage_finished',
  STAGE_UNDONE = 'stage_undone',
  COMPLETED = 'completed',
  ISSUE_REPORTED = 'issue_reported',
  ISSUE_RESOLVED = 'issue_resolved',
}
