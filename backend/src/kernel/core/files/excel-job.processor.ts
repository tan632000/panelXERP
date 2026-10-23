import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import JSZip from 'jszip';

import { ExcelExportRegistry } from '@kernel/core/files/excel-export.registry';
import {
  EXCEL_CLEANUP_JOB,
  EXCEL_DOWNLOAD_TTL_MS,
  EXCEL_EXPORT_JOB,
  EXCEL_EXPORT_KEY_PREFIX,
  EXCEL_JOB_CONCURRENCY,
  EXCEL_JOB_RETENTION_SECONDS,
  EXCEL_PARSE_JOB,
  EXCEL_QUEUE,
  EXCEL_ZIP_CONTENT_TYPE,
} from '@kernel/core/files/excel-job.constants';
import {
  ExcelJobError,
  toExcelJobError,
} from '@kernel/core/files/excel-job.error';

import { EXCEL_EXPORT_MAX_ROWS } from '@shared/constants/excel';
import { ExcelSheetParser } from '@shared/services/excel-sheet.parser';
import { ExcelWorkbookBuilder } from '@shared/services/excel-workbook.builder';
import { S3StorageService } from '@shared/services/s3-storage.service';

import type {
  ExcelCleanupJobData,
  ExcelExportJobData,
  ExcelExportJobResult,
  ExcelJobData,
  ExcelParseJobData,
  ExcelParseJobResult,
} from '@kernel/core/files/excel-job.constants';
import type { Job, Queue } from 'bull';

/** Reports a stage and whole percent, skipping repeats and never moving backwards. */
function progressReporter(job: Job) {
  let lastStage = '';
  let lastPercent = -1;
  return (stage: string, percent: number): void => {
    const next = Math.max(lastPercent, Math.min(100, Math.floor(percent)));
    if (stage === lastStage && next === lastPercent) return;
    lastStage = stage;
    lastPercent = next;
    // Progress is advisory: a lost update must never fail the job.
    void Promise.resolve(job.progress({ stage, percent: next })).catch(
      () => undefined,
    );
  };
}

/**
 * Runs the Excel jobs. Every export and parse job runs once (no retry), and any temporary
 * object it created is either handed to its cleanup job or deleted before it ends.
 *
 * Bull dispatches every named `@Process` handler out of the same shared per-processor slot
 * pool, so two named handlers at concurrency 2 would together hold 4 slots, not 2 (D14). All
 * three job kinds are instead run from one wildcard (`'*'`) handler at `EXCEL_JOB_CONCURRENCY`,
 * which dispatches on `job.name` itself. It must be the wildcard, not an unnamed handler: Bull
 * files an unnamed handler under `__default__` and only falls back to `'*'` for a named job.
 */
@Processor(EXCEL_QUEUE)
export class ExcelJobProcessor {
  private readonly logger = new Logger(ExcelJobProcessor.name);

  constructor(
    @InjectQueue(EXCEL_QUEUE) private readonly queue: Queue<ExcelJobData>,
    private readonly registry: ExcelExportRegistry,
    private readonly builder: ExcelWorkbookBuilder,
    private readonly parser: ExcelSheetParser,
    private readonly storage: S3StorageService,
  ) {}

  @Process({ name: '*', concurrency: EXCEL_JOB_CONCURRENCY })
  async process(job: Job<ExcelJobData>): Promise<unknown> {
    switch (job.name) {
      case EXCEL_EXPORT_JOB:
        return this.runExport(job as Job<ExcelExportJobData>);
      case EXCEL_PARSE_JOB:
        return this.runParse(job as Job<ExcelParseJobData>);
      case EXCEL_CLEANUP_JOB:
        return this.runCleanup(job as Job<ExcelCleanupJobData>);
      default:
        throw this.failure(job, new ExcelJobError('internal'));
    }
  }

  async runExport(job: Job<ExcelExportJobData>): Promise<ExcelExportJobResult> {
    const report = progressReporter(job);
    const data = job.data;
    try {
      report('querying', 5);
      const onWritten = (done: number, total: number) =>
        report('writing', 10 + (done / total) * 75);
      const workbook = data.sheets
        ? await this.writeSheets(data, data.sheets, onWritten, report)
        : await this.writeSheet(data, onWritten, report);

      report('compressing', 90);
      const zip = await new JSZip()
        .file(`${data.fileName}.xlsx`, workbook)
        .generateAsync({
          type: 'nodebuffer',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        });

      // The download window starts when the file is ready, not when the job was requested:
      // a long export must still leave the reader its full thirty minutes.
      const completedAt = Date.now();
      const expiresAt = completedAt + EXCEL_DOWNLOAD_TTL_MS;
      const s3Key = `${EXCEL_EXPORT_KEY_PREFIX}/${data.userId}/${job.id}.zip`;

      // Scheduled before the upload, so no crash can leave an object with no deletion pending.
      const cleanup: ExcelCleanupJobData = { kind: 'cleanup', s3Key };
      await this.queue.add(EXCEL_CLEANUP_JOB, cleanup, {
        delay: EXCEL_DOWNLOAD_TTL_MS,
        jobId: `cleanup-${job.id}`,
        removeOnComplete: true,
        removeOnFail: { age: EXCEL_JOB_RETENTION_SECONDS },
      });

      report('uploading', 95);
      await this.storage.upload(s3Key, zip, EXCEL_ZIP_CONTENT_TYPE);

      return {
        kind: 'export',
        fileName: data.fileName,
        sizeBytes: zip.length,
        completedAt,
        expiresAt,
        s3Key,
      };
    } catch (error) {
      throw this.failure(job, error);
    }
  }

  /** A list export: the single sheet, from its source's one row set. */
  private async writeSheet(
    data: ExcelExportJobData,
    onWritten: (done: number, total: number) => void,
    report: (stage: string, percent: number) => void,
  ): Promise<Buffer> {
    const source = this.registry.get(data.sourceKey);
    if (!source || !data.sheet) throw new ExcelJobError('internal');

    if (
      source.countRows &&
      (await source.countRows(data.query, data.context)) > EXCEL_EXPORT_MAX_ROWS
    ) {
      throw new ExcelJobError('exportTooLarge');
    }
    const rows = await source.fetchRows(data.query, data.context);
    if (rows.length > EXCEL_EXPORT_MAX_ROWS) {
      throw new ExcelJobError('exportTooLarge');
    }

    report('writing', 10);
    return this.builder.build(
      data.sheet,
      rows,
      source.allowedFields,
      onWritten,
    );
  }

  /** A multi-sheet export: one worksheet per entry, each from the row set of its key. */
  private async writeSheets(
    data: ExcelExportJobData,
    sheets: NonNullable<ExcelExportJobData['sheets']>,
    onWritten: (done: number, total: number) => void,
    report: (stage: string, percent: number) => void,
  ): Promise<Buffer> {
    const source = this.registry.getMultiSheet(data.sourceKey);
    if (!source) throw new ExcelJobError('internal');

    const rowSets = await source.fetchSheets(data.query, data.context);
    const inputs = sheets.map((entry) => ({
      sheet: entry.sheet,
      rows: rowSets[entry.key] ?? [],
      allowedFields: source.sheetFields[entry.key] ?? [],
    }));
    const totalRows = inputs.reduce((sum, input) => sum + input.rows.length, 0);
    if (totalRows > EXCEL_EXPORT_MAX_ROWS) {
      throw new ExcelJobError('exportTooLarge');
    }

    report('writing', 10);
    return this.builder.buildSheets(inputs, onWritten);
  }

  async runParse(job: Job<ExcelParseJobData>): Promise<ExcelParseJobResult> {
    const report = progressReporter(job);
    const data = job.data;
    try {
      report('downloading', 5);
      const buffer = await this.storage.getObjectBuffer(data.s3Key);

      report('reading', 10);
      const { rows, issues } = await this.parser.parse(
        buffer,
        data.sheet,
        (read, total) => report('reading', 10 + (read / total) * 85),
      );
      return {
        kind: 'parse',
        rowCount: rows.length,
        rows,
        ...(issues.length > 0 ? { issues } : {}),
      };
    } catch (error) {
      throw this.failure(job, error);
    } finally {
      // The upload only existed to be read once; it goes whatever the outcome.
      await this.storage
        .deleteObject(data.s3Key)
        .catch((error: unknown) =>
          this.logger.warn(
            `Could not delete import upload ${data.s3Key}: ${String(error)}`,
          ),
        );
    }
  }

  /** Deleting a key that is already gone (downloaded, say) succeeds; S3 deletes are idempotent. */
  async runCleanup(job: Job<ExcelCleanupJobData>): Promise<void> {
    await this.storage.deleteObject(job.data.s3Key);
  }

  private failure(job: Job, error: unknown): ExcelJobError {
    const failure = toExcelJobError(error);
    if (failure.code === 'internal') {
      this.logger.error(
        `Excel job ${String(job.id)} (${job.name}) failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    return failure;
  }
}
