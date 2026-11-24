import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

import { AiTimeoutError } from '@plugins/sales/estimate/ai/ai-errors';
import { ESTIMATE_AI_RUN_TIMEOUT_MS } from '@plugins/sales/estimate/constants/estimate-ai.constant';
import {
  EstimateAiPrefillService,
  runErrorText,
} from '@plugins/sales/estimate/services/estimate-ai-prefill.service';

/** Fails every run still active since before `$2`; answers `[rows, affectedCount]`. */
export const SWEEP_STUCK_RUNS_SQL = `UPDATE sales_estimate_ai_runs
  SET status = 'failed', error = $1, updated_at = now()
  WHERE status IN ('queued', 'running') AND created_at < $2
  RETURNING id, request_id, created_by`;

/**
 * Frees a request whose run never ended (a restart killed the job, the queue lost it): every
 * minute, a run still `queued` or `running` after ten minutes is failed. A late job that wakes
 * up afterwards finds the run ended and writes nothing.
 */
@Injectable()
export class EstimateAiSweeperService {
  private readonly logger = new Logger(EstimateAiSweeperService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly prefill: EstimateAiPrefillService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    try {
      const timeout = new AiTimeoutError();
      const cutoff = new Date(Date.now() - ESTIMATE_AI_RUN_TIMEOUT_MS);
      // TypeORM answers an UPDATE ... RETURNING as [rows, affectedCount].
      const [stuck]: [
        Array<{ id: number; request_id: number; created_by: number }>,
        number,
      ] = await this.dataSource.manager.query(SWEEP_STUCK_RUNS_SQL, [
        runErrorText(timeout),
        cutoff,
      ]);
      for (const run of stuck) {
        this.logger.warn(`AI run ${run.id} timed out`);
        await this.prefill.notifyFailed(
          run.request_id,
          run.created_by,
          timeout,
        );
      }
    } catch (error: unknown) {
      // A failed pass waits for the next minute; it must never stop the backend.
      this.logger.error(
        'The AI run sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
