import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveActivityLog } from '@shared/logger/erp-log.core';
import { ErpLogFormatter } from '@shared/logger/erp-log.formatter';
import { ActivityTrackPayload } from '@shared/logger/erp-log.types';
import { LogStreamService } from '@shared/logger/log-stream.service';
import { LoggerService } from '@shared/logger/logger.service';

@Injectable()
export class ActivityLogService extends LogStreamService {
  constructor(
    logger: LoggerService,
    configService: ConfigService,
    erpLogFormatter: ErpLogFormatter,
  ) {
    super(
      logger,
      configService,
      erpLogFormatter,
      'activity',
      'activities',
      configService.get<string>('logging.cloudWatchActivitiesGroup') || '',
    );
  }

  track(payload: ActivityTrackPayload): void {
    void this.publish(resolveActivityLog(payload));
  }
}
