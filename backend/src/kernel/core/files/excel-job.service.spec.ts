import { EventEmitter } from 'events';
import { Readable } from 'stream';

import { HttpException } from '@nestjs/common';

import { ExcelExportRegistry } from '@kernel/core/files/excel-export.registry';
import { ExcelJobService } from '@kernel/core/files/excel-job.service';

import { ExcelWorkbookBuilder } from '@shared/services/excel-workbook.builder';

import type { ExcelJobData } from '@kernel/core/files/excel-job.constants';
import type { S3StorageService } from '@shared/services/s3-storage.service';
import type { Job, Queue } from 'bull';

const SHEET = { columns: [{ key: 'code', label: 'Mã' }] };

class FakeQueue extends EventEmitter {
  add = jest.fn((_name: string, _data: unknown, options?: { jobId?: string }) =>
    Promise.resolve({ id: options?.jobId ?? 'job-1' }),
  );
  getJobs = jest.fn(() => Promise.resolve([] as Array<Partial<Job>>));
  getJob = jest.fn((): Promise<Partial<Job> | null> => Promise.resolve(null));
  // Reservations and the download claim are atomic Redis operations (M3, M4); `eval` always
  // grants the slot and `set ... NX` always claims the download unless a test says otherwise.
  client = {
    eval: jest.fn().mockResolvedValue(1),
    zrem: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
}

function httpError(error: unknown): {
  status: number;
  body: Record<string, unknown>;
} {
  const exception = error as HttpException;
  return {
    status: exception.getStatus(),
    body: exception.getResponse() as Record<string, unknown>,
  };
}

function storedJob(overrides: Record<string, unknown> = {}): Job {
  return {
    id: 'job-1',
    data: {
      kind: 'export',
      userId: 7,
      label: 'Dịch vụ',
      createdAt: 1,
      fileName: 'DichVu',
    },
    returnvalue: {
      kind: 'export',
      fileName: 'DichVu',
      sizeBytes: 10,
      completedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      s3Key: 'excel-exports/7/job-1.zip',
    },
    getState: jest.fn().mockResolvedValue('completed'),
    progress: jest.fn().mockReturnValue({ stage: 'uploading', percent: 95 }),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Job;
}

describe('ExcelJobService', () => {
  let queue: FakeQueue;
  let storage: {
    upload: jest.Mock;
    deleteObject: jest.Mock;
    getObjectStream: jest.Mock;
  };
  let builder: ExcelWorkbookBuilder;
  let service: ExcelJobService;

  beforeEach(() => {
    queue = new FakeQueue();
    storage = {
      upload: jest.fn().mockResolvedValue({}),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      getObjectStream: jest.fn().mockResolvedValue(Readable.from(['zip'])),
    };
    const registry = new ExcelExportRegistry();
    registry.register('rows', {
      allowedFields: ['code'],
      fetchRows: jest.fn(),
    });
    builder = new ExcelWorkbookBuilder();
    service = new ExcelJobService(
      queue as unknown as Queue<ExcelJobData>,
      registry,
      builder,
      storage as unknown as S3StorageService,
    );
    service.onModuleInit();
  });

  const exportInput = {
    userId: 7,
    sourceKey: 'rows',
    label: 'Dịch vụ',
    fileName: 'DichVu_Export_2026-09-24',
    query: { status: 'open' },
    sheet: SHEET,
    context: { canViewPrice: true },
  };

  describe('enqueueExport (R7.1)', () => {
    it('adds one export job carrying the user and returns its id, building nothing', async () => {
      const build = jest.spyOn(builder, 'build');

      const { jobId } = await service.enqueueExport(exportInput);
      expect(typeof jobId).toBe('string');
      expect(jobId.length).toBeGreaterThan(0);

      expect(queue.add).toHaveBeenCalledTimes(1);
      const [name, data, options] = queue.add.mock.calls[0];
      expect(name).toBe('export');
      expect(data).toMatchObject({
        kind: 'export',
        userId: 7,
        sourceKey: 'rows',
        query: { status: 'open' },
        context: { canViewPrice: true },
      });
      expect(options).toMatchObject({
        jobId,
        attempts: 1,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 3600 },
      });
      expect(build).not.toHaveBeenCalled();
    });

    it('rejects a field outside the source allowlist with no job', async () => {
      const error = await service
        .enqueueExport({
          ...exportInput,
          sheet: {
            columns: [{ key: 'x', label: 'X', fields: [{ field: 'secret' }] }],
          },
        })
        .catch((e: unknown) => e);

      expect(httpError(error)).toMatchObject({
        status: 400,
        body: { code: 'unknownField', field: 'secret' },
      });
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('rejects a file name carrying a path', async () => {
      const error = await service
        .enqueueExport({ ...exportInput, fileName: '../secret' })
        .catch((e: unknown) => e);

      expect(httpError(error).body).toMatchObject({ code: 'invalidSpec' });
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('enqueueMultiSheetExport', () => {
    let multiService: ExcelJobService;

    beforeEach(() => {
      const registry = new ExcelExportRegistry();
      registry.registerMultiSheet('report', {
        sheetFields: { summary: ['code'], months: ['code', 'qty'] },
        fetchSheets: jest.fn(),
      });
      multiService = new ExcelJobService(
        queue as unknown as Queue<ExcelJobData>,
        registry,
        builder,
        storage as unknown as S3StorageService,
      );
    });

    const multiInput = {
      userId: 7,
      sourceKey: 'report',
      label: 'Báo cáo',
      fileName: 'BaoCao_20260801_20260831',
      query: { from: '2026-08-01' },
      sheets: [
        { key: 'summary', sheet: SHEET },
        {
          key: 'months',
          sheet: { columns: [{ key: 'qty', label: 'SL' }] },
        },
      ],
      context: {},
    };

    it('queues one export job carrying every validated sheet, in order', async () => {
      const { jobId } = await multiService.enqueueMultiSheetExport(multiInput);

      const [name, data, options] = queue.add.mock.calls[0];
      expect(name).toBe('export');
      expect(options).toMatchObject({ jobId, attempts: 1 });
      expect(data).toMatchObject({
        kind: 'export',
        sourceKey: 'report',
        sheets: [{ key: 'summary' }, { key: 'months' }],
      });
      expect((data as { sheet?: unknown }).sheet).toBeUndefined();
    });

    it.each([
      ['an unknown row set', [{ key: 'other', sheet: SHEET }]],
      [
        'the same row set twice',
        [
          { key: 'summary', sheet: SHEET },
          { key: 'summary', sheet: SHEET },
        ],
      ],
      ['no sheet at all', []],
    ])('refuses %s with no job', async (_label, sheets) => {
      const error = await multiService
        .enqueueMultiSheetExport({ ...multiInput, sheets })
        .catch((caught: unknown) => caught);

      expect(httpError(error).body).toMatchObject({ code: 'invalidSpec' });
      expect(queue.add).not.toHaveBeenCalled();
    });

    it("refuses a field outside that row set's own allowlist", async () => {
      const error = await multiService
        .enqueueMultiSheetExport({
          ...multiInput,
          sheets: [
            {
              key: 'summary',
              sheet: { columns: [{ key: 'qty', label: 'SL' }] },
            },
          ],
        })
        .catch((caught: unknown) => caught);

      expect(httpError(error).body).toMatchObject({ code: 'unknownField' });
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('returns the workbook on the call and does not queue a job', async () => {
      const fetchSheets = jest.fn().mockResolvedValue({
        summary: [{ code: 'A' }],
        months: [{ code: 'A', qty: 2 }],
      });
      const registry = new ExcelExportRegistry();
      registry.registerMultiSheet('report-now', {
        sheetFields: { summary: ['code'], months: ['code', 'qty'] },
        fetchSheets,
      });
      const direct = new ExcelJobService(
        queue as unknown as Queue<ExcelJobData>,
        registry,
        builder,
        storage as unknown as S3StorageService,
      );

      const buffer = await direct.renderMultiSheetExport({
        sourceKey: 'report-now',
        fileName: 'BaoCao_20260801_20260831',
        query: { from: '2026-08-01' },
        sheets: multiInput.sheets,
        context: {},
      });

      expect(fetchSheets).toHaveBeenCalledWith({ from: '2026-08-01' }, {});
      expect(queue.add).not.toHaveBeenCalled();
      expect(buffer.subarray(0, 2).toString()).toBe('PK');
    });

    it('refuses a list source key, which is not a multi-sheet source', async () => {
      await expect(
        service.enqueueMultiSheetExport({ ...multiInput, sourceKey: 'rows' }),
      ).rejects.toThrow('not registered');
    });
  });

  describe('open job limit (R7.4, M4)', () => {
    it('refuses a fourth open job with 429 and adds nothing', async () => {
      queue.client.eval.mockResolvedValue(0);

      const error = await service
        .enqueueExport(exportInput)
        .catch((e: unknown) => e);

      expect(httpError(error)).toMatchObject({
        status: 429,
        body: { code: 'tooManyJobs' },
      });
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('reserves the slot in a key scoped to this user, before adding the job', async () => {
      await service.enqueueExport(exportInput);

      expect(queue.client.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.stringContaining(':7'),
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        3,
        expect.any(Number),
      );
      expect(queue.client.eval.mock.invocationCallOrder[0]).toBeLessThan(
        queue.add.mock.invocationCallOrder[0],
      );
    });

    it('releases the slot when the job cannot be added to the queue', async () => {
      queue.add.mockRejectedValueOnce(new Error('redis down'));

      await expect(service.enqueueExport(exportInput)).rejects.toThrow(
        'redis down',
      );

      expect(queue.client.zrem).toHaveBeenCalledWith(
        expect.stringContaining(':7'),
        expect.any(String),
      );
    });

    it("releases a completed job's slot from the global terminal event (M4)", async () => {
      queue.getJob.mockResolvedValue({
        data: { kind: 'export', userId: 7 },
      } as Partial<Job> as Job);

      queue.emit('global:completed', 'job-9', '{}');
      await new Promise((resolve) => setImmediate(resolve));

      expect(queue.client.zrem).toHaveBeenCalledWith(
        expect.stringContaining(':7'),
        'job-9',
      );
    });

    it("does not release a slot for a cleanup job's terminal event", async () => {
      queue.getJob.mockResolvedValue({
        data: { kind: 'cleanup', s3Key: 'a' },
      } as Partial<Job> as Job);

      queue.emit('global:completed', 'cleanup-9', '{}');
      await new Promise((resolve) => setImmediate(resolve));

      expect(queue.client.zrem).not.toHaveBeenCalled();
    });
  });

  describe('enqueueParse', () => {
    const file = {
      buffer: Buffer.from('xlsx'),
      originalname: 'a.xlsx',
    } as Express.Multer.File;

    it('stores the upload under the job id before queueing it', async () => {
      const { jobId } = await service.enqueueParse(
        7,
        file,
        JSON.stringify(SHEET),
        'a.xlsx',
      );

      expect(storage.upload).toHaveBeenCalledWith(
        `excel-imports/7/${jobId}.xlsx`,
        file.buffer,
        expect.any(String),
      );
      const [name, data, options] = queue.add.mock.calls[0];
      expect(name).toBe('parse');
      expect(data).toMatchObject({
        s3Key: `excel-imports/7/${jobId}.xlsx`,
        userId: 7,
      });
      expect(options).toMatchObject({ jobId, attempts: 1 });
      expect(storage.upload.mock.invocationCallOrder[0]).toBeLessThan(
        queue.add.mock.invocationCallOrder[0],
      );
    });

    it('deletes the upload when the job cannot be queued', async () => {
      queue.add.mockRejectedValueOnce(new Error('redis down'));

      await expect(
        service.enqueueParse(7, file, JSON.stringify(SHEET), 'a.xlsx'),
      ).rejects.toThrow('redis down');
      const [uploadedKey] = storage.upload.mock.calls[0] as [string];
      expect(storage.deleteObject).toHaveBeenCalledWith(uploadedKey);
    });

    it('rejects an unreadable sheet spec before storing anything', async () => {
      const error = await service
        .enqueueParse(7, file, '{not json', 'a')
        .catch((e: unknown) => e);

      expect(httpError(error).body).toMatchObject({ code: 'invalidSpec' });
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('checks the job limit before storing anything (M4)', async () => {
      queue.client.eval.mockResolvedValue(0);

      await expect(
        service.enqueueParse(7, file, JSON.stringify(SHEET), 'a'),
      ).rejects.toBeInstanceOf(HttpException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('releases the reserved slot when the upload fails', async () => {
      storage.upload.mockRejectedValueOnce(new Error('s3 down'));

      await expect(
        service.enqueueParse(7, file, JSON.stringify(SHEET), 'a.xlsx'),
      ).rejects.toThrow('s3 down');

      expect(queue.client.zrem).toHaveBeenCalledWith(
        expect.stringContaining(':7'),
        expect.any(String),
      );
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('getOwnedJob (R7.3)', () => {
    it('answers a foreign, a cleanup and a missing job with the same 404 body', async () => {
      const bodies: unknown[] = [];
      for (const found of [
        storedJob(),
        storedJob({ data: { kind: 'cleanup', s3Key: 'k' } }),
        null,
      ]) {
        queue.getJob.mockResolvedValueOnce(found);
        const error = await service
          .getOwnedJob('job-1', 8)
          .catch((e: unknown) => e);
        expect(httpError(error).status).toBe(404);
        bodies.push(httpError(error).body);
      }
      expect(bodies[0]).toEqual(bodies[1]);
      expect(bodies[1]).toEqual(bodies[2]);
    });
  });

  describe('snapshot (C6)', () => {
    it('exposes a finished export without its storage key', async () => {
      const job = storedJob();

      const snapshot = await service.snapshot(job as never);

      expect(snapshot).toMatchObject({
        id: 'job-1',
        kind: 'export',
        state: 'completed',
        stage: 'done',
        percent: 100,
        result: { fileName: 'DichVu', sizeBytes: 10, downloaded: false },
      });
      expect(JSON.stringify(snapshot)).not.toContain('excel-exports');
    });

    it('reads a failure code back from the failed reason', async () => {
      const job = storedJob({
        getState: jest.fn().mockResolvedValue('failed'),
        failedReason: JSON.stringify({ code: 'exportTooLarge' }),
      });

      await expect(service.snapshot(job as never)).resolves.toMatchObject({
        state: 'failed',
        error: { code: 'exportTooLarge' },
      });
    });

    it('re-reads a job that failed after it was loaded', async () => {
      // Loaded while still active, so the copy has no reason although the state is failed.
      const job = storedJob({
        getState: jest.fn().mockResolvedValue('failed'),
        failedReason: undefined,
      });
      queue.getJob.mockResolvedValueOnce({
        ...job,
        failedReason: JSON.stringify({ code: 'invalidFile' }),
      } as never);

      await expect(service.snapshot(job as never)).resolves.toMatchObject({
        state: 'failed',
        error: { code: 'invalidFile' },
      });
    });

    it('re-reads a job that completed after it was loaded', async () => {
      const finished = storedJob();
      const job = storedJob({ returnvalue: undefined });
      queue.getJob.mockResolvedValueOnce(finished as never);

      await expect(service.snapshot(job as never)).resolves.toMatchObject({
        state: 'completed',
        result: { fileName: 'DichVu' },
      });
    });

    it('reports a reason Bull wrote itself as internal', async () => {
      const job = storedJob({
        getState: jest.fn().mockResolvedValue('failed'),
        failedReason: 'job stalled more than allowable limit',
      });

      await expect(service.snapshot(job as never)).resolves.toMatchObject({
        error: { code: 'internal' },
      });
    });
  });

  describe('download (R8.3, R8.4, M3)', () => {
    it('opens the stored zip while the window is open', async () => {
      const opened = await service.openDownload(storedJob() as never);

      expect(opened.fileName).toBe('DichVu.zip');
      expect(storage.getObjectStream).toHaveBeenCalledWith(
        'excel-exports/7/job-1.zip',
      );
    });

    it('claims the download atomically before reading S3', async () => {
      await service.openDownload(storedJob() as never);

      expect(queue.client.set).toHaveBeenCalledWith(
        expect.stringContaining('job-1'),
        '1',
        'PX',
        expect.any(Number),
        'NX',
      );
      expect(queue.client.set.mock.invocationCallOrder[0]).toBeLessThan(
        storage.getObjectStream.mock.invocationCallOrder[0],
      );
    });

    it('answers the loser of two concurrent downloads with 410, not a stream', async () => {
      queue.client.set.mockResolvedValueOnce(null);

      const error = await service
        .openDownload(storedJob() as never)
        .catch((e: unknown) => e);

      expect(httpError(error)).toMatchObject({
        status: 410,
        body: { code: 'fileExpired' },
      });
      expect(storage.getObjectStream).not.toHaveBeenCalled();
    });

    it('maps a missing S3 object to 410 and releases the claim', async () => {
      storage.getObjectStream.mockRejectedValueOnce(
        Object.assign(new Error('not found'), { name: 'NoSuchKey' }),
      );

      const error = await service
        .openDownload(storedJob() as never)
        .catch((e: unknown) => e);

      expect(httpError(error)).toMatchObject({
        status: 410,
        body: { code: 'fileExpired' },
      });
      expect(queue.client.del).toHaveBeenCalledWith(
        expect.stringContaining('job-1'),
      );
    });

    it('releases the claim so a retry can download after an abort', async () => {
      await service.releaseDownloadClaim('job-1');

      expect(queue.client.del).toHaveBeenCalledWith(
        expect.stringContaining('job-1'),
      );
    });

    it('answers 410 at exactly expiresAt without reading S3', async () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const job = storedJob({
        returnvalue: {
          kind: 'export',
          fileName: 'DichVu',
          sizeBytes: 10,
          completedAt: now - 1_800_000,
          expiresAt: now,
          s3Key: 'excel-exports/7/job-1.zip',
        },
      });

      const error = await service
        .openDownload(job as never)
        .catch((e: unknown) => e);

      expect(httpError(error)).toMatchObject({
        status: 410,
        body: { code: 'fileExpired' },
      });
      expect(storage.getObjectStream).not.toHaveBeenCalled();
      jest.restoreAllMocks();
    });

    it('answers 410 once the file was downloaded', async () => {
      const job = storedJob({
        data: {
          kind: 'export',
          userId: 7,
          label: 'x',
          createdAt: 1,
          downloadedAt: 5,
        },
      });

      const error = await service
        .openDownload(job as never)
        .catch((e: unknown) => e);

      expect(httpError(error).status).toBe(410);
      expect(storage.getObjectStream).not.toHaveBeenCalled();
    });

    it('consumes the file after a completed download', async () => {
      const job = storedJob();

      await service.markDownloaded(job as never);

      expect(storage.deleteObject).toHaveBeenCalledWith(
        'excel-exports/7/job-1.zip',
      );
      const { update } = job as unknown as { update: jest.Mock };
      const [written] = update.mock.calls[0] as [{ downloadedAt: unknown }];
      expect(typeof written.downloadedAt).toBe('number');
    });

    it('writes downloadedAt before deleting the object (M3)', async () => {
      const job = storedJob();
      const { update } = job as unknown as { update: jest.Mock };

      await service.markDownloaded(job as never);

      expect(update.mock.invocationCallOrder[0]).toBeLessThan(
        storage.deleteObject.mock.invocationCallOrder[0],
      );
    });
  });

  it('fans global Bull events out to the watchers of that job only', () => {
    const watcher = jest.fn();
    const other = jest.fn();
    const unwatch = service.watch('job-1', watcher);
    service.watch('job-2', other);

    queue.emit(
      'global:progress',
      'job-1',
      JSON.stringify({ stage: 'writing', percent: 40 }),
    );
    queue.emit('global:completed', 'job-1', '{}');
    unwatch();
    queue.emit('global:failed', 'job-1', '{}');

    expect(watcher.mock.calls).toEqual([
      [{ type: 'progress', progress: { stage: 'writing', percent: 40 } }],
      [{ type: 'terminal' }],
    ]);
    expect(other).not.toHaveBeenCalled();
  });
});
