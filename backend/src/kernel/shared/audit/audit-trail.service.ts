import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveAuditLog } from '@shared/logger/erp-log.core';
import { ErpLogFormatter } from '@shared/logger/erp-log.formatter';
import { AuditRecordPayload } from '@shared/logger/erp-log.types';
import { LogStreamService } from '@shared/logger/log-stream.service';
import { LoggerService } from '@shared/logger/logger.service';

@Injectable()
export class AuditTrailService extends LogStreamService {
  constructor(
    logger: LoggerService,
    configService: ConfigService,
    erpLogFormatter: ErpLogFormatter,
  ) {
    super(
      logger,
      configService,
      erpLogFormatter,
      'audit',
      'audit',
      configService.get<string>('logging.cloudWatchAuditGroup') || '',
    );
  }

  record(payload: AuditRecordPayload): void {
    void this.publish(resolveAuditLog(payload));
  }
}
