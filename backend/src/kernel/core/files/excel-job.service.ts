import { randomUUID } from 'crypto';

import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  PayloadTooLargeException,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { ExcelExportRegistry } from '@kernel/core/files/excel-export.registry';
import {
  EXCEL_DOWNLOAD_CLAIM_KEY_PREFIX,
  EXCEL_EXPORT_JOB,
  EXCEL_FILE_NAME_PATTERN,
  EXCEL_IMPORT_KEY_PREFIX,
  EXCEL_JOB_RETENTION_SECONDS,
  EXCEL_MAX_OPEN_JOBS_PER_USER,
  EXCEL_OPEN_JOBS_KEY_PREFIX,
  EXCEL_PARSE_JOB,
  EXCEL_QUEUE,
} from '@kernel/core/files/excel-job.constants';
import { parseExcelJobFailure } from '@kernel/core/files/excel-job.error';

import {
  EXCEL_EXPORT_MAX_ROWS,
  EXCEL_MAX_SHEETS,
  EXCEL_XLSX_CONTENT_TYPE,
} from '@shared/constants/excel';
import { ExcelWorkbookBuilder } from '@shared/services/excel-workbook.builder';
import { S3StorageService } from '@shared/services/s3-storage.service';

import type {
  ExcelExportJobData,
  ExcelExportSheetEntry,
  ExcelExportJobResult,
  ExcelJobData,
  ExcelJobProgress,
  ExcelJobSnapshot,
  ExcelJobState,
  ExcelParseJobData,
  ExcelParseJobResult,
} from '@kernel/core/files/excel-job.constants';
import type { ExcelSheetSpecDto } from '@shared/dto/excel-sheet-spec.dto';
import type { ExcelParsedRow } from '@shared/services/excel-sheet.parser';
import type { Job, JobOptions, Queue } from 'bull';
import type { Readable } from 'stream';

export type ExcelJobEvent =
  { type: 'progress'; progress: ExcelJobProgress } | { type: 'terminal' };

type ExcelJobListener = (event: ExcelJobEvent) => void;

export interface EnqueueExportInput {
  userId: number;
  sourceKey: string;
  label: string;
  fileName: string;
  query: Record<string, unknown>;
  sheet: ExcelSheetSpecDto;
  context: Record<string, unknown>;
}

export interface EnqueueMultiSheetExportInput extends Omit<
  EnqueueExportInput,
  'sheet'
> {
  sheets: ExcelExportSheetEntry[];
}

const JOB_OPTIONS: JobOptions = {
  // A retried export would upload a second file; a retried parse would re-read a deleted upload.
  attempts: 1,
  removeOnComplete: { age: EXCEL_JOB_RETENTION_SECONDS },
  removeOnFail: { age: EXCEL_JOB_RETENTION_SECONDS },
};

function jobNotFound(): NotFoundException {
  return new NotFoundException({
    message: 'Job not found',
    code: 'jobNotFound',
  });
}

function tooManyJobs(): HttpException {
  return new HttpException(
    { message: 'Too many Excel jobs in progress', code: 'tooManyJobs' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

function invalidSpec(): BadRequestException {
  return new BadRequestException({
    message: 'Invalid Excel sheet spec',
    code: 'invalidSpec',
  });
}

function assertFileName(fileName: string): void {
  if (!EXCEL_FILE_NAME_PATTERN.test(fileName)) {
    throw new BadRequestException({
      message: 'Invalid file name',
      code: 'invalidSpec',
    });
  }
}

function fileExpired(): GoneException {
  return new GoneException({
    message: 'The file has expired',
    code: 'fileExpired',
  });
}

/** True for an S3 "no such key" answer, however the SDK happens to shape it. */
function isMissingObject(error: unknown): boolean {
  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate?.name === 'NoSuchKey' ||
    candidate?.Code === 'NoSuchKey' ||
    candidate?.$metadata?.httpStatusCode === 404
  );
}

/**
 * Reserves one of a user's open-job slots and adds the reservation to `key`, pruning anything
 * older than `staleBefore` first so a reservation whose owner crashed before releasing it
 * cannot lock the user out forever. Atomic: every caller racing for the last slot sees a
 * consistent count.
 */
const RESERVE_SLOT_SCRIPT = `
local key = KEYS[1]
local member = ARGV[1]
local now = tonumber(ARGV[2])
local staleBefore = tonumber(ARGV[3])
local limit = tonumber(ARGV[4])
local ttlMs = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', key, '-inf', staleBefore)
if redis.call('ZCARD', key) >= limit then
  return 0
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, ttlMs)
return 1
`;

function toProgress(value: unknown): ExcelJobProgress | null {
  const raw = typeof value === 'string' ? safeJson(value) : value;
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as ExcelJobProgress).stage === 'string' &&
    typeof (raw as ExcelJobProgress).percent === 'number'
  ) {
    return raw as ExcelJobProgress;
  }
  return null;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toState(state: string): ExcelJobState {
  if (state === 'completed' || state === 'failed' || state === 'active') {
    return state;
  }
  return 'waiting';
}

/**
 * Accepts Excel export and import work onto the `excel` queue and answers every question a
 * client asks about a job it owns. Nothing here touches business tables; the rows an export
 * writes come from the feature's registered source, run inside the worker.
 */
@Injectable()
export class ExcelJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExcelJobService.name);
  private readonly listeners = new Map<string, Set<ExcelJobListener>>();

  private readonly onProgress = (jobId: string | number, progress: unknown) => {
    const parsed = toProgress(progress);
    if (parsed) {
      this.emit(String(jobId), { type: 'progress', progress: parsed });
    }
  };

  private readonly onTerminal = (jobId: string | number) => {
    this.emit(String(jobId), { type: 'terminal' });
    // Best-effort: a slot that outlives its job is still cleaned up by the next reservation's
    // own stale-entry pruning, so a lost release here cannot lock the user out.
    void this.releaseUserSlotForJob(String(jobId)).catch((error: unknown) =>
      this.logger.warn(
        `Could not release the open-job slot for ${String(jobId)}: ${String(error)}`,
      ),
    );
  };

  constructor(
    @InjectQueue(EXCEL_QUEUE) private readonly queue: Queue<ExcelJobData>,
    private readonly registry: ExcelExportRegistry,
    private readonly builder: ExcelWorkbookBuilder,
    private readonly storage: S3StorageService,
  ) {}

  /**
   * Global events travel over Redis pub/sub, so the instance holding a client's stream hears
   * about a job no matter which instance runs it.
   */
  onModuleInit(): void {
    this.queue.on('global:progress', this.onProgress);
    this.queue.on('global:completed', this.onTerminal);
    this.queue.on('global:failed', this.onTerminal);
  }

  onModuleDestroy(): void {
    this.queue.removeListener('global:progress', this.onProgress);
    this.queue.removeListener('global:completed', this.onTerminal);
    this.queue.removeListener('global:failed', this.onTerminal);
  }

  async enqueueExport(input: EnqueueExportInput): Promise<{ jobId: string }> {
    const source = this.registry.get(input.sourceKey);
    if (!source) {
      throw new InternalServerErrorException(
        `Excel export source "${input.sourceKey}" is not registered`,
      );
    }
    assertFileName(input.fileName);
    const sheet = this.builder.assertSpec(input.sheet, source.allowedFields);

    return this.queueExport({
      kind: 'export',
      userId: input.userId,
      label: input.label,
      createdAt: Date.now(),
      sourceKey: input.sourceKey,
      query: input.query,
      sheet,
      fileName: input.fileName,
      context: input.context,
    });
  }

  /**
   * Queues one workbook holding a worksheet per entry, each read from the multi-sheet source's
   * row set of the same key. Every entry is validated against that row set's own allowlist
   * before anything is queued.
   */
  async enqueueMultiSheetExport(
    input: EnqueueMultiSheetExportInput,
  ): Promise<{ jobId: string }> {
    const { sheets } = this.validatedMultiSheet(input);

    return this.queueExport({
      kind: 'export',
      userId: input.userId,
      label: input.label,
      createdAt: Date.now(),
      sourceKey: input.sourceKey,
      query: input.query,
      sheets: sheets.map(({ key, sheet }) => ({ key, sheet })),
      fileName: input.fileName,
      context: input.context,
    });
  }

  /**
   * Builds the same multi-sheet workbook the queue would, and returns it. The caller streams
   * the file on the request that asked for it.
   */
  async renderMultiSheetExport(
    input: Omit<EnqueueMultiSheetExportInput, 'userId' | 'label'>,
  ): Promise<Buffer> {
    const { source, sheets } = this.validatedMultiSheet({
      ...input,
      userId: 0,
      label: input.fileName,
    });
    const rowSets = await source.fetchSheets(input.query, input.context);
    const sheetInputs = sheets.map((entry) => ({
      sheet: entry.sheet,
      rows: rowSets[entry.key] ?? [],
      allowedFields: entry.allowedFields,
    }));
    const totalRows = sheetInputs.reduce(
      (sum, entry) => sum + entry.rows.length,
      0,
    );
    if (totalRows > EXCEL_EXPORT_MAX_ROWS) {
      throw new PayloadTooLargeException({
        message: 'Export exceeds the row limit',
        code: 'exportTooLarge',
      });
    }
    return this.builder.buildSheets(sheetInputs);
  }

  /** Checks the source, the sheet keys and each sheet's fields before a job or a direct file. */
  private validatedMultiSheet(input: EnqueueMultiSheetExportInput): {
    source: NonNullable<ReturnType<ExcelExportRegistry['getMultiSheet']>>;
    sheets: Array<ExcelExportSheetEntry & { allowedFields: readonly string[] }>;
  } {
    const source = this.registry.getMultiSheet(input.sourceKey);
    if (!source) {
      throw new InternalServerErrorException(
        `Excel export source "${input.sourceKey}" is not registered`,
      );
    }
    assertFileName(input.fileName);
    const keys = input.sheets.map((entry) => entry.key);
    if (
      input.sheets.length === 0 ||
      input.sheets.length > EXCEL_MAX_SHEETS ||
      new Set(keys).size !== keys.length
    ) {
      throw invalidSpec();
    }
    const sheets = input.sheets.map((entry) => {
      const allowedFields = source.sheetFields[entry.key];
      if (!allowedFields) throw invalidSpec();
      return {
        key: entry.key,
        sheet: this.builder.assertSpec(entry.sheet, allowedFields),
        allowedFields,
      };
    });
    return { source, sheets };
  }

  /** Reserves the user's slot, then queues the export under the job's own id. */
  private async queueExport(
    data: ExcelExportJobData,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    if (!(await this.reserveUserSlot(data.userId, jobId))) {
      throw tooManyJobs();
    }
    try {
      await this.queue.add(EXCEL_EXPORT_JOB, data, { ...JOB_OPTIONS, jobId });
    } catch (error) {
      await this.releaseUserSlot(data.userId, jobId).catch(() => undefined);
      throw error;
    }
    return { jobId };
  }

  /**
   * Reserves the user's slot before storing anything, then stores the upload under the job's
   * own id and queues it. A job that cannot be reserved or queued takes its upload with it.
   */
  async enqueueParse(
    userId: number,
    file: Express.Multer.File | undefined,
    sheetJson: unknown,
    label: string,
  ): Promise<{ jobId: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        message: 'No file uploaded',
        code: 'invalidFile',
      });
    }
    const sheet = this.builder.assertSpec(this.parseSheet(sheetJson));

    const jobId = randomUUID();
    if (!(await this.reserveUserSlot(userId, jobId))) {
      throw tooManyJobs();
    }

    const s3Key = `${EXCEL_IMPORT_KEY_PREFIX}/${userId}/${jobId}.xlsx`;
    try {
      await this.storage.upload(s3Key, file.buffer, EXCEL_XLSX_CONTENT_TYPE);
    } catch (error) {
      await this.releaseUserSlot(userId, jobId).catch(() => undefined);
      throw error;
    }

    const data: ExcelParseJobData = {
      kind: 'parse',
      userId,
      label,
      createdAt: Date.now(),
      sheet,
      s3Key,
    };
    try {
      await this.queue.add(EXCEL_PARSE_JOB, data, { ...JOB_OPTIONS, jobId });
    } catch (error) {
      await this.releaseUserSlot(userId, jobId).catch(() => undefined);
      await this.storage.deleteObject(s3Key).catch(() => undefined);
      throw error;
    }
    return { jobId };
  }

  /** The job, when it exists and belongs to `userId`; the same 404 otherwise. */
  async getOwnedJob(
    jobId: string,
    userId: number,
  ): Promise<Job<ExcelExportJobData | ExcelParseJobData>> {
    const job = await this.queue.getJob(jobId);
    if (!job || job.data.kind === 'cleanup' || job.data.userId !== userId) {
      throw jobNotFound();
    }
    return job as Job<ExcelExportJobData | ExcelParseJobData>;
  }

  async snapshot(
    loaded: Job<ExcelExportJobData | ExcelParseJobData>,
  ): Promise<ExcelJobSnapshot> {
    const state = toState(await loaded.getState());
    // The job may have been read just before it finished: its state is then terminal while the
    // loaded copy still lacks the result or failure reason, so read it once more.
    const stale =
      (state === 'completed' && !loaded.returnvalue) ||
      (state === 'failed' && !loaded.failedReason);
    const job = stale
      ? (((await this.queue.getJob(loaded.id)) as typeof loaded | null) ??
        loaded)
      : loaded;
    const progress = toProgress(job.progress()) ?? {
      stage: 'queued',
      percent: 0,
    };
    const snapshot: ExcelJobSnapshot = {
      id: String(job.id),
      kind: job.data.kind,
      label: job.data.label,
      state,
      stage: state === 'completed' ? 'done' : progress.stage,
      percent: state === 'completed' ? 100 : progress.percent,
    };

    if (state === 'completed' && job.returnvalue) {
      const result = job.returnvalue as
        ExcelExportJobResult | ExcelParseJobResult;
      snapshot.result =
        result.kind === 'export'
          ? {
              fileName: result.fileName,
              sizeBytes: result.sizeBytes,
              expiresAt: new Date(result.expiresAt).toISOString(),
              downloaded: Boolean(
                (job.data as ExcelExportJobData).downloadedAt,
              ),
            }
          : {
              rowCount: result.rowCount,
              ...(result.issues?.length ? { issues: result.issues } : {}),
            };
    }
    if (state === 'failed') {
      snapshot.error = parseExcelJobFailure(job.failedReason);
    }
    return snapshot;
  }

  /** Calls `listener` for this job's progress and its terminal event; returns an unsubscribe. */
  watch(jobId: string, listener: ExcelJobListener): () => void {
    const set = this.listeners.get(jobId) ?? new Set<ExcelJobListener>();
    set.add(listener);
    this.listeners.set(jobId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(jobId);
    };
  }

  async parseRows(
    job: Job<ExcelExportJobData | ExcelParseJobData>,
  ): Promise<ExcelParsedRow[]> {
    if (job.data.kind !== 'parse') throw jobNotFound();
    if ((await job.getState()) !== 'completed') throw jobNotCompleted();
    return (job.returnvalue as ExcelParseJobResult).rows;
  }

  /**
   * Opens a finished export for its one download. Expiry is checked before S3 is touched, so
   * a late request costs nothing and can never read an object the cleanup is removing. The
   * download is then claimed atomically in Redis before the object is opened, so two requests
   * racing for the same job can never both stream it (C3); the loser sees the same 410 a late
   * request would.
   */
  async openDownload(
    job: Job<ExcelExportJobData | ExcelParseJobData>,
  ): Promise<{ stream: Readable; fileName: string }> {
    if (job.data.kind !== 'export') throw jobNotFound();
    if ((await job.getState()) !== 'completed') throw jobNotCompleted();

    const result = job.returnvalue as ExcelExportJobResult;
    if (job.data.downloadedAt || Date.now() >= result.expiresAt) {
      throw fileExpired();
    }

    const jobId = String(job.id);
    const claimed = await this.queue.client.set(
      this.downloadClaimKey(jobId),
      '1',
      'PX',
      Math.max(1, result.expiresAt - Date.now()),
      'NX',
    );
    if (claimed !== 'OK') throw fileExpired();

    try {
      const stream = await this.storage.getObjectStream(result.s3Key);
      return { stream, fileName: `${result.fileName}.zip` };
    } catch (error) {
      await this.releaseDownloadClaim(jobId).catch(() => undefined);
      if (isMissingObject(error)) throw fileExpired();
      throw error;
    }
  }

  /** Releases a download's claim without consuming the file, so a retry can still download it. */
  async releaseDownloadClaim(jobId: string): Promise<void> {
    await this.queue.client.del(this.downloadClaimKey(jobId));
  }

  /**
   * Consumes the file once its download has been written out in full. `downloadedAt` is
   * written before the object is deleted, so a request reading `job.data` between the two
   * steps still sees the download as claimed instead of racing a `getObjectStream` against
   * the delete.
   */
  async markDownloaded(
    job: Job<ExcelExportJobData | ExcelParseJobData>,
  ): Promise<void> {
    const result = job.returnvalue as ExcelExportJobResult;
    await job.update({
      ...(job.data as ExcelExportJobData),
      downloadedAt: Date.now(),
    });
    await this.storage.deleteObject(result.s3Key);
  }

  private emit(jobId: string, event: ExcelJobEvent): void {
    for (const listener of this.listeners.get(jobId) ?? []) {
      try {
        listener(event);
      } catch (error) {
        this.logger.warn(
          `Excel job listener failed for ${jobId}: ${String(error)}`,
        );
      }
    }
  }

  private parseSheet(value: unknown): ExcelSheetSpecDto {
    const parsed = typeof value === 'string' ? safeJson(value) : null;
    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException({
        message: 'Invalid Excel sheet spec',
        code: 'invalidSpec',
      });
    }
    return parsed as ExcelSheetSpecDto;
  }

  private openJobsKey(userId: number): string {
    return `${EXCEL_OPEN_JOBS_KEY_PREFIX}:${userId}`;
  }

  private downloadClaimKey(jobId: string): string {
    return `${EXCEL_DOWNLOAD_CLAIM_KEY_PREFIX}:${jobId}`;
  }

  /** Atomically takes one of the user's open-job slots, or answers false if none is free. */
  private async reserveUserSlot(
    userId: number,
    jobId: string,
  ): Promise<boolean> {
    const now = Date.now();
    const result = await this.queue.client.eval(
      RESERVE_SLOT_SCRIPT,
      1,
      this.openJobsKey(userId),
      jobId,
      now,
      now - EXCEL_JOB_RETENTION_SECONDS * 1000,
      EXCEL_MAX_OPEN_JOBS_PER_USER,
      EXCEL_JOB_RETENTION_SECONDS * 1000,
    );
    return result === 1;
  }

  private async releaseUserSlot(userId: number, jobId: string): Promise<void> {
    await this.queue.client.zrem(this.openJobsKey(userId), jobId);
  }

  private async releaseUserSlotForJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job?.data || job.data.kind === 'cleanup') return;
    await this.releaseUserSlot(job.data.userId, jobId);
  }
}

function jobNotCompleted(): ConflictException {
  return new ConflictException({
    message: 'The job has not finished',
    code: 'jobNotCompleted',
  });
}
