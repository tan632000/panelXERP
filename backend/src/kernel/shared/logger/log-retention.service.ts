import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DailyFileLogWriter } from '@shared/logger/daily-file-log-writer';
import { LoggerService } from '@shared/logger/logger.service';

@Injectable()
export class LogRetentionService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    if (!this.configService.get<boolean>('logging.isFileMode')) {
      return;
    }

    void this.cleanup();
    this.cleanupTimer = setInterval(
      () => {
        void this.cleanup();
      },
      24 * 60 * 60 * 1000,
    );
  }

  private async cleanup(): Promise<void> {
    const logDir = this.configService.get<string>('logging.logDir') || 'logs';
    const retentionDays =
      this.configService.get<number>('logging.retentionDays') || 30;
    const writer = new DailyFileLogWriter(logDir, retentionDays);
    const removed = await writer.cleanupExpiredFiles();

    if (removed > 0) {
      this.logger.logSuccess({
        module: 'LogRetention',
        action: 'cleanup',
        message: 'Expired log files removed',
        context: { removed, retention_days: retentionDays },
      });
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
