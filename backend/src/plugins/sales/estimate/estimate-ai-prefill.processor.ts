import { Process, Processor } from '@nestjs/bull';

import {
  ESTIMATE_AI_JOB,
  ESTIMATE_AI_QUEUE,
} from '@plugins/sales/estimate/constants/estimate-ai.constant';
import { EstimateAiPrefillService } from '@plugins/sales/estimate/services/estimate-ai-prefill.service';

import type { Job } from 'bull';

/** Two AI calls at once: each waits on the provider, and the sweeper bounds a run to ten minutes. */
const CONCURRENCY = 2;

@Processor(ESTIMATE_AI_QUEUE)
export class EstimateAiPrefillProcessor {
  constructor(private readonly prefill: EstimateAiPrefillService) {}

  @Process({ name: ESTIMATE_AI_JOB, concurrency: CONCURRENCY })
  handle(job: Job<{ runId: number }>): Promise<void> {
    return this.prefill.execute(job.data.runId);
  }
}
