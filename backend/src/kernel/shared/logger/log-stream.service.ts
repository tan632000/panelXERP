import { DailyFileLogWriter } from '@shared/logger/daily-file-log-writer';
import { RemoteLogPublisher } from '@shared/logger/remote-log-publisher';

import type { OnModuleDestroy } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ErpLogFormatter } from '@shared/logger/erp-log.formatter';
import type { ErpLogCategory, ErpLogInput } from '@shared/logger/erp-log.types';
import type { LoggerService } from '@shared/logger/logger.service';

export abstract class LogStreamService implements OnModuleDestroy {
  private readonly isFileMode: boolean;
  private readonly fileWriter?: DailyFileLogWriter;
  private readonly remotePublisher?: RemoteLogPublisher;

  constructor(
    protected readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly erpLogFormatter: ErpLogFormatter,
    protected readonly filePrefix: ErpLogCategory,
    protected readonly s3Prefix: string,
    cloudWatchGroup: string,
  ) {
    this.isFileMode =
      this.configService.get<boolean>('logging.isFileMode') ?? true;

    if (this.isFileMode) {
      const logDir = this.configService.get<string>('logging.logDir') || 'logs';
      const retentionDays =
        this.configService.get<number>('logging.retentionDays') || 30;
      this.fileWriter = new DailyFileLogWriter(logDir, retentionDays);
      return;
    }

    const aws = this.configService.get<{
      region?: string;
      endpoint?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      forcePathStyle?: boolean;
      s3LogBucket?: string;
    }>('aws');

    this.remotePublisher = new RemoteLogPublisher({
      s3Prefix: this.s3Prefix,
      cloudWatchGroup,
      s3Bucket:
        this.configService.get<string>('logging.s3LogBucket') ||
        aws?.s3LogBucket ||
        'erp-logs',
      flushIntervalMs:
        this.configService.get<number>('logging.flushIntervalMs') || 60_000,
      cloudWatchEnabled:
        this.configService.get<boolean>('logging.cloudWatchEnabled') ?? false,
      aws: aws || {},
    });
  }

  async publish(input: ErpLogInput): Promise<void> {
    const { line } = this.erpLogFormatter.format({
      ...input,
      category: this.filePrefix,
    });

    if (this.isFileMode && this.fileWriter) {
      try {
        await this.fileWriter.append(this.filePrefix, line);
      } catch (err) {
        this.logger.logError({
          module: this.filePrefix,
          action: 'write',
          message: `Failed to write ${this.filePrefix} log file`,
          errorCode: 'LOG_WRITE_FAILED',
          error: err,
        });
      }
      return;
    }

    this.remotePublisher?.publish(line);
  }

  onModuleDestroy(): void {
    this.remotePublisher?.onModuleDestroy();
  }
}
