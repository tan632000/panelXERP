/** Where one AI run stands; a run leaves `queued` and `running` only for `succeeded` or `failed`. */
export enum EstimateAiRunStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}
