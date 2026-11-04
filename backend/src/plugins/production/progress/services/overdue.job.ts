import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { vnToday } from '@plugins/production/_shared/utils/vn-today.util';
import { OverdueService } from '@plugins/production/progress/services/overdue.service';

/**
 * Runs the overdue check every morning at 07:00 Vietnam time, and once at start-up so a day
 * missed while the backend was down is made up (the dedupe makes a repeat harmless).
 */
@Injectable()
export class OverdueJob
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(OverdueJob.name);
  private startupRun: Promise<void> | undefined;

  constructor(private readonly overdue: OverdueService) {}

  /** Not awaited: a slow check must not keep the app from listening. */
  onApplicationBootstrap(): void {
    this.startupRun = this.runToday();
  }

  /** The app must not close under a check that is still writing. */
  async beforeApplicationShutdown(): Promise<void> {
    await this.startupRun;
  }

  @Cron('0 7 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  runToday(): Promise<void> {
    // A failed pass is logged and waits for the next one; it must never stop the backend.
    return this.overdue.run(vnToday()).then(
      () => undefined,
      (error: unknown) =>
        this.logger.error(
          'The overdue check failed',
          error instanceof Error ? error.stack : String(error),
        ),
    );
  }
}
