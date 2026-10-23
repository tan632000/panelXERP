import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { HookRegistry } from '@kernel/platform/plugins/hook-registry';

import { ActivityLogService } from '@shared/activities/activity-log.service';
import { AuditTrailService } from '@shared/audit/audit-trail.service';
import { DocumentCodeModule } from '@shared/document-code/document-code.module';
import { LoggingInterceptor } from '@shared/interceptors/logging.interceptor';
import { ErpLogFormatter } from '@shared/logger/erp-log.formatter';
import { LogRetentionService } from '@shared/logger/log-retention.service';
import { LoggerService } from '@shared/logger/logger.service';
import { DataScopeService } from '@shared/services/data-scope.service';
import { EmailService } from '@shared/services/email.service';
import { ExcelSheetParser } from '@shared/services/excel-sheet.parser';
import { ExcelWorkbookBuilder } from '@shared/services/excel-workbook.builder';
import { S3StorageService } from '@shared/services/s3-storage.service';

@Global()
@Module({
  imports: [DocumentCodeModule],
  providers: [
    ErpLogFormatter,
    LoggerService,
    LogRetentionService,
    S3StorageService,
    EmailService,
    ExcelWorkbookBuilder,
    ExcelSheetParser,
    AuditTrailService,
    ActivityLogService,
    DataScopeService,
    HookRegistry,
    LoggingInterceptor,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
  exports: [
    LoggerService,
    S3StorageService,
    EmailService,
    ExcelWorkbookBuilder,
    ExcelSheetParser,
    AuditTrailService,
    ActivityLogService,
    DataScopeService,
    HookRegistry,
    DocumentCodeModule,
  ],
})
export class SharedModule {}
