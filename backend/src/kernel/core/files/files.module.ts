import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';

import { ExcelExportRegistry } from '@kernel/core/files/excel-export.registry';
import { EXCEL_QUEUE } from '@kernel/core/files/excel-job.constants';
import { ExcelJobProcessor } from '@kernel/core/files/excel-job.processor';
import { ExcelJobService } from '@kernel/core/files/excel-job.service';
import { ExcelController } from '@kernel/core/files/excel.controller';
import { FilesController } from '@kernel/core/files/files.controller';
import { FilesService } from '@kernel/core/files/files.service';

import { S3StorageService } from '@shared/services/s3-storage.service';

/**
 * File storage routes and the Excel job system. A feature that exports imports this module
 * to register its export source and queue jobs; a feature that stores attachments under its
 * own scopes uses `FilesService` from here.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: EXCEL_QUEUE,
      // A stalled export/parse job (no retry, R7.5) must fail outright, not silently re-run
      // and re-upload or re-read an upload that a previous attempt already consumed.
      settings: { maxStalledCount: 0 },
    }),
  ],
  controllers: [FilesController, ExcelController],
  providers: [
    FilesService,
    S3StorageService,
    ExcelExportRegistry,
    ExcelJobService,
    ExcelJobProcessor,
  ],
  exports: [ExcelExportRegistry, ExcelJobService, FilesService],
})
export class FilesModule {}
