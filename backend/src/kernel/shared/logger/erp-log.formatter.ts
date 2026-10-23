import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  buildErpLogEntry,
  resolveLogCategory,
  serializeErpLogEntry,
} from '@shared/logger/erp-log.core';
import { ErpLogBuildOptions, ErpLogInput } from '@shared/logger/erp-log.types';

@Injectable()
export class ErpLogFormatter {
  private readonly options: ErpLogBuildOptions;

  constructor(private readonly configService: ConfigService) {
    this.options = {
      service:
        this.configService.get<string>('logging.serviceName') || 'erp-backend',
      environment:
        this.configService.get<string>('app.nodeEnv') ||
        process.env.NODE_ENV ||
        'development',
      tenantId: this.configService.get<string>('logging.tenantId'),
      timezoneOffset:
        this.configService.get<string>('logging.timezoneOffset') || '+07:00',
    };
  }

  format(input: ErpLogInput) {
    const entry = buildErpLogEntry(input, this.options);
    const category = resolveLogCategory(input);
    return {
      category,
      entry,
      line: serializeErpLogEntry(entry),
    };
  }
}
