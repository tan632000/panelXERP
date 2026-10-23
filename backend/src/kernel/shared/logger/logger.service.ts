import {
  Injectable,
  LoggerService as NestLoggerService,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';

import { DailyFileLogWriter } from '@shared/logger/daily-file-log-writer';
import {
  resolveDebugLog,
  resolveErrorLog,
  resolveSuccessLog,
  resolveWarnLog,
} from '@shared/logger/erp-log.core';
import { ErpLogFormatter } from '@shared/logger/erp-log.formatter';
import {
  BusinessLogPayload,
  ErrorLogPayload,
  ErpLogInput,
} from '@shared/logger/erp-log.types';
import { RemoteLogPublisher } from '@shared/logger/remote-log-publisher';

@Injectable()
export class LoggerService implements NestLoggerService, OnModuleDestroy {
  private readonly consoleLogger: winston.Logger;
  private readonly isFileMode: boolean;
  private readonly fileWriter?: DailyFileLogWriter;
  private readonly remotePublisher?: RemoteLogPublisher;

  constructor(
    private readonly configService: ConfigService,
    private readonly erpLogFormatter: ErpLogFormatter,
  ) {
    const isDev = process.env.NODE_ENV !== 'production';
    this.isFileMode =
      this.configService.get<boolean>('logging.isFileMode') ?? true;

    this.consoleLogger = winston.createLogger({
      level:
        this.configService.get<string>('logging.level') ||
        (isDev ? 'debug' : 'info'),
      transports: [
        new winston.transports.Console({
          format: isDev
            ? winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
              )
            : winston.format.json(),
        }),
      ],
    });

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
      s3Prefix: 'app',
      cloudWatchGroup:
        this.configService.get<string>('logging.cloudWatchAppGroup') || '',
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

  /** Low-level API — prefer logSuccess/logError/logWarn/logDebug */
  write(input: ErpLogInput): void {
    const { category, entry, line } = this.erpLogFormatter.format(input);
    this.consoleLogger.log(entry.level.toLowerCase(), entry.message, entry);

    if (this.isFileMode && this.fileWriter) {
      void this.fileWriter.append(category, line);
      return;
    }

    this.remotePublisher?.publish(line);
  }

  logSuccess(payload: BusinessLogPayload): void {
    this.write(resolveSuccessLog(payload));
  }

  logError(payload: ErrorLogPayload): void {
    this.write(resolveErrorLog(payload));
  }

  logWarn(payload: BusinessLogPayload): void {
    this.write(resolveWarnLog(payload));
  }

  logDebug(payload: BusinessLogPayload): void {
    this.write(resolveDebugLog(payload));
  }

  log(message: string, context?: string): void {
    this.logSuccess({
      module: context || 'app',
      action: 'log',
      message,
    });
  }

  error(message: string, trace?: string, context?: string): void {
    this.logError({
      module: context || 'app',
      action: 'error',
      message,
      context: trace ? { trace } : undefined,
    });
  }

  warn(message: string, context?: string): void {
    this.logWarn({
      module: context || 'app',
      action: 'warn',
      message,
    });
  }

  debug(message: string, context?: string): void {
    this.logDebug({
      module: context || 'app',
      action: 'debug',
      message,
    });
  }

  verbose(message: string, context?: string): void {
    this.logDebug({
      module: context || 'app',
      action: 'verbose',
      message,
    });
  }

  onModuleDestroy(): void {
    this.remotePublisher?.onModuleDestroy();
  }
}
