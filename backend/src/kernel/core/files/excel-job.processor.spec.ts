import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import { ExcelExportRegistry } from '@kernel/core/files/excel-export.registry';
import { EXCEL_DOWNLOAD_TTL_MS } from '@kernel/core/files/excel-job.constants';
import { ExcelJobError } from '@kernel/core/files/excel-job.error';
import { ExcelJobProcessor } from '@kernel/core/files/excel-job.processor';

import { ExcelSheetParser } from '@shared/services/excel-sheet.parser';
import { ExcelWorkbookBuilder } from '@shared/services/excel-workbook.builder';

import type {
  ExcelExportJobData,
  ExcelJobData,
  ExcelParseJobData,
} from '@kernel/core/files/excel-job.constants';
import type { S3StorageService } from '@shared/services/s3-storage.service';
import type { Job, Queue } from 'bull';

const SHEET = {
  columns: [
    { key: 'code', label: 'Mã' },
    {
      key: 'qty',
      label: 'SL',
      fields: [{ field: 'qty', type: 'number' as const }],
    },
  ],
};

function fakeJob<T>(data: T, id = 'job-1', name = 'export'): Job<T> {
  return {
    id,
    name,
    data,
    progress: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job<T>;
}

function exportData(
  overrides: Partial<ExcelExportJobData> = {},
): ExcelExportJobData {
  return {
    kind: 'export',
    userId: 7,
    label: 'Dịch vụ',
    createdAt: Date.now(),
    sourceKey: 'rows',
    query: { status: 'open' },
    sheet: SHEET,
    fileName: 'DichVu_Export_2026-09-24',
    context: { canViewPrice: false },
    ...overrides,
  };
}

async function xlsxWithHeader(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow(['Mã', 'SL']);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function percents(job: Job): number[] {
  return (job.progress as jest.Mock).mock.calls.map(
    ([value]: [{ percent: number }]) => value.percent,
  );
}

describe('ExcelJobProcessor', () => {
  let queue: { add: jest.Mock };
  let storage: {
    upload: jest.Mock;
    getObjectBuffer: jest.Mock;
    deleteObject: jest.Mock;
  };
  let registry: ExcelExportRegistry;
  let builder: ExcelWorkbookBuilder;
  let fetchRows: jest.Mock;
  let processor: ExcelJobProcessor;

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue({}) };
    storage = {
      upload: jest.fn().mockResolvedValue({}),
      getObjectBuffer: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    fetchRows = jest.fn().mockResolvedValue([
      { code: 'A', qty: 1 },
      { code: 'B', qty: 2 },
    ]);
    registry = new ExcelExportRegistry();
    registry.register('rows', { allowedFields: ['code', 'qty'], fetchRows });
    builder = new ExcelWorkbookBuilder();
    processor = new ExcelJobProcessor(
      queue as unknown as Queue<ExcelJobData>,
      registry,
      builder,
      new ExcelSheetParser(),
      storage as unknown as S3StorageService,
    );
  });

  describe('export (R8.1)', () => {
    it('zips one workbook entry and uploads it under the user and job id', async () => {
      const job = fakeJob(exportData());

      const result = await processor.runExport(job);

      expect(fetchRows).toHaveBeenCalledWith(
        { status: 'open' },
        { canViewPrice: false },
      );
      const [key, body, contentType] = storage.upload.mock.calls[0] as [
        string,
        Buffer,
        string,
      ];
      expect(key).toBe('excel-exports/7/job-1.zip');
      expect(contentType).toBe('application/zip');
      const zip = await JSZip.loadAsync(body);
      expect(Object.keys(zip.files)).toEqual(['DichVu_Export_2026-09-24.xlsx']);

      const entry = zip.file('DichVu_Export_2026-09-24.xlsx');
      if (!entry) throw new Error('zip entry missing');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        (await entry.async('nodebuffer')) as unknown as ExcelJS.Buffer,
      );
      expect(workbook.worksheets[0].getCell('A3').value).toBe('B');

      expect(result).toMatchObject({
        kind: 'export',
        fileName: 'DichVu_Export_2026-09-24',
        sizeBytes: body.length,
        s3Key: 'excel-exports/7/job-1.zip',
      });
      expect(result.expiresAt - result.completedAt).toBe(EXCEL_DOWNLOAD_TTL_MS);
    });

    it('schedules the cleanup before uploading, with the full window as delay', async () => {
      await processor.runExport(fakeJob(exportData()));

      expect(queue.add).toHaveBeenCalledWith(
        'cleanup',
        { kind: 'cleanup', s3Key: 'excel-exports/7/job-1.zip' },
        expect.objectContaining({
          delay: EXCEL_DOWNLOAD_TTL_MS,
          jobId: 'cleanup-job-1',
        }),
      );
      expect(queue.add.mock.invocationCallOrder[0]).toBeLessThan(
        storage.upload.mock.invocationCallOrder[0],
      );
    });

    it('anchors expiry to the zip-ready instant, not the request time (R8.4)', async () => {
      const requestedAt = Date.now() - 25 * 60 * 1000;
      const result = await processor.runExport(
        fakeJob(exportData({ createdAt: requestedAt })),
      );

      // Measuring from the request would leave the reader five minutes, not thirty.
      expect(result.expiresAt).toBeGreaterThan(
        requestedAt + EXCEL_DOWNLOAD_TTL_MS,
      );
      expect(result.expiresAt).toBe(result.completedAt + EXCEL_DOWNLOAD_TTL_MS);
    });

    it('reports stages with a percentage that never goes back (R7.2)', async () => {
      const job = fakeJob(exportData());
      await processor.runExport(job);

      const stages = (job.progress as jest.Mock).mock.calls.map(
        ([value]: [{ stage: string }]) => value.stage,
      );
      expect(stages[0]).toBe('querying');
      expect(stages).toEqual(
        expect.arrayContaining(['writing', 'compressing', 'uploading']),
      );
      const values = percents(job);
      expect([...values].sort((a, b) => a - b)).toEqual(values);
    });

    it('fails exportTooLarge above 50,000 rows without building or uploading', async () => {
      fetchRows.mockResolvedValue(Array.from({ length: 50_001 }, () => ({})));
      const build = jest.spyOn(builder, 'build');

      await expect(
        processor.runExport(fakeJob(exportData())),
      ).rejects.toMatchObject({
        code: 'exportTooLarge',
      });
      expect(build).not.toHaveBeenCalled();
      expect(storage.upload).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('still builds exactly 50,000 rows', async () => {
      fetchRows.mockResolvedValue(Array.from({ length: 50_000 }, () => ({})));
      const build = jest
        .spyOn(builder, 'build')
        .mockResolvedValue(Buffer.from('xlsx'));

      await processor.runExport(fakeJob(exportData()));

      expect(build).toHaveBeenCalledTimes(1);
    });

    it('turns an unexpected error into internal (R7.5)', async () => {
      fetchRows.mockRejectedValue(new Error('database down'));

      const error = (await processor
        .runExport(fakeJob(exportData()))
        .catch((e: unknown) => e)) as ExcelJobError;

      expect(error).toBeInstanceOf(ExcelJobError);
      expect(error.code).toBe('internal');
      expect(JSON.parse(error.message)).toEqual({ code: 'internal' });
      expect(storage.upload).not.toHaveBeenCalled();
    });

    describe('countRows (D18)', () => {
      it('fails exportTooLarge from the cheap count, without ever fetching rows', async () => {
        const countRows = jest.fn().mockResolvedValue(50_001);
        registry = new ExcelExportRegistry();
        registry.register('rows', {
          allowedFields: ['code', 'qty'],
          fetchRows,
          countRows,
        });
        processor = new ExcelJobProcessor(
          queue as unknown as Queue<ExcelJobData>,
          registry,
          builder,
          new ExcelSheetParser(),
          storage as unknown as S3StorageService,
        );

        await expect(
          processor.runExport(fakeJob(exportData())),
        ).rejects.toMatchObject({ code: 'exportTooLarge' });

        expect(countRows).toHaveBeenCalledWith(
          { status: 'open' },
          { canViewPrice: false },
        );
        expect(fetchRows).not.toHaveBeenCalled();
      });

      it('proceeds to fetchRows when the count is at or below the cap', async () => {
        const countRows = jest.fn().mockResolvedValue(50_000);
        registry = new ExcelExportRegistry();
        registry.register('rows', {
          allowedFields: ['code', 'qty'],
          fetchRows,
          countRows,
        });
        processor = new ExcelJobProcessor(
          queue as unknown as Queue<ExcelJobData>,
          registry,
          builder,
          new ExcelSheetParser(),
          storage as unknown as S3StorageService,
        );

        await processor.runExport(fakeJob(exportData()));

        expect(fetchRows).toHaveBeenCalled();
      });

      it('checks the cap on the fetched rows when the source has no countRows', async () => {
        fetchRows.mockResolvedValue(Array.from({ length: 50_001 }, () => ({})));

        await expect(
          processor.runExport(fakeJob(exportData())),
        ).rejects.toMatchObject({ code: 'exportTooLarge' });
        expect(fetchRows).toHaveBeenCalled();
      });
    });
  });

  describe('multi-sheet export', () => {
    let fetchSheets: jest.Mock;

    beforeEach(() => {
      fetchSheets = jest.fn().mockResolvedValue({
        summary: [{ code: 'Tổng' }],
        months: [
          { code: 'T1', qty: 3 },
          { code: 'T2', qty: 4 },
        ],
      });
      registry.registerMultiSheet('report', {
        sheetFields: { summary: ['code'], months: ['code', 'qty'] },
        fetchSheets,
      });
    });

    const multiData = () =>
      exportData({
        sourceKey: 'report',
        sheet: undefined,
        sheets: [
          {
            key: 'summary',
            sheet: {
              columns: [{ key: 'code', label: 'Chỉ tiêu' }],
              sheetName: 'Tổng quan',
            },
          },
          { key: 'months', sheet: { ...SHEET, sheetName: 'Theo tháng' } },
        ],
      });

    it('writes one worksheet per entry, each from the row set of its key', async () => {
      await processor.runExport(fakeJob(multiData()));

      expect(fetchSheets).toHaveBeenCalledWith(
        { status: 'open' },
        { canViewPrice: false },
      );
      const [, body] = storage.upload.mock.calls[0] as [string, Buffer];
      const zip = await JSZip.loadAsync(body);
      const entry = zip.file('DichVu_Export_2026-09-24.xlsx');
      if (!entry) throw new Error('zip entry missing');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        (await entry.async('nodebuffer')) as unknown as ExcelJS.Buffer,
      );

      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
        'Tổng quan',
        'Theo tháng',
      ]);
      expect(workbook.getWorksheet('Tổng quan')?.getCell('A2').value).toBe(
        'Tổng',
      );
      const months = workbook.getWorksheet('Theo tháng');
      expect(months?.getCell('A1').value).toBe('Mã');
      expect(months?.getCell('B3').value).toBe(4);
    });

    it('fails as exportTooLarge when the row sets together pass the row cap', async () => {
      fetchSheets.mockResolvedValue({
        months: Array.from({ length: 50_001 }, () => ({ code: 'X', qty: 1 })),
      });

      await expect(
        processor.runExport(fakeJob(multiData())),
      ).rejects.toMatchObject({ code: 'exportTooLarge' });
      expect(storage.upload).not.toHaveBeenCalled();
    });
  });

  describe('process (M1 dispatch)', () => {
    it('registers as the wildcard handler, so named jobs reach it', () => {
      // Bull looks a job up as `handlers[job.name] || handlers['*']`; an unnamed handler is filed
      // under `__default__` and would leave every `export`/`parse`/`cleanup` job unhandled.
      const metadata = Reflect.getMetadata(
        'bull:module_queue_process',
        Object.getOwnPropertyDescriptor(ExcelJobProcessor.prototype, 'process')
          ?.value as object,
      ) as { name?: string; concurrency?: number };
      expect(metadata).toMatchObject({ name: '*', concurrency: 2 });
    });

    it('routes an export job name to runExport', async () => {
      const job = fakeJob(exportData(), 'job-1', 'export');
      const spy = jest.spyOn(processor, 'runExport');

      await processor.process(job);

      expect(spy).toHaveBeenCalledWith(job);
    });

    it('routes a parse job name to runParse', async () => {
      storage.getObjectBuffer.mockResolvedValue(
        await xlsxWithHeader([['A', 1]]),
      );
      const job = fakeJob<ExcelParseJobData>(
        {
          kind: 'parse',
          userId: 7,
          label: 'import.xlsx',
          createdAt: Date.now(),
          sheet: SHEET,
          s3Key: 'excel-imports/7/job-1.xlsx',
        },
        'job-1',
        'parse',
      );
      const spy = jest.spyOn(processor, 'runParse');

      await processor.process(job);

      expect(spy).toHaveBeenCalledWith(job);
    });

    it('routes a cleanup job name to runCleanup', async () => {
      const job = fakeJob<ExcelJobData>(
        { kind: 'cleanup', s3Key: 'excel-exports/7/x.zip' },
        'job-1',
        'cleanup',
      );
      const spy = jest.spyOn(processor, 'runCleanup');

      await processor.process(job);

      expect(spy).toHaveBeenCalledWith(job);
    });

    it('fails an unrecognized job name as internal', async () => {
      const job = fakeJob({} as unknown as ExcelJobData, 'job-1', 'unknown');

      await expect(processor.process(job)).rejects.toMatchObject({
        code: 'internal',
      });
    });
  });

  describe('parse', () => {
    function parseJob(): Job<ExcelParseJobData> {
      return fakeJob<ExcelParseJobData>({
        kind: 'parse',
        userId: 7,
        label: 'import.xlsx',
        createdAt: Date.now(),
        sheet: SHEET,
        s3Key: 'excel-imports/7/job-1.xlsx',
      });
    }

    it('reads the upload into keyed rows and deletes it (R4.5)', async () => {
      storage.getObjectBuffer.mockResolvedValue(
        await xlsxWithHeader([
          ['A', 1],
          ['B', 2],
        ]),
      );

      const result = await processor.runParse(parseJob());

      expect(result.rowCount).toBe(2);
      expect(result.rows[1]).toEqual({
        fileRow: 3,
        values: { code: 'B', qty: '2' },
      });
      expect(storage.deleteObject).toHaveBeenCalledWith(
        'excel-imports/7/job-1.xlsx',
      );
    });

    it('completes with rows and a requiredMissing issue instead of failing (non-fatal)', async () => {
      storage.getObjectBuffer.mockResolvedValue(
        await xlsxWithHeader([
          ['A', 1],
          ['', 2],
        ]),
      );
      const required = {
        columns: [{ ...SHEET.columns[0], required: true }, SHEET.columns[1]],
      };

      const result = await processor.runParse({
        ...parseJob(),
        data: { ...parseJob().data, sheet: required },
      });

      expect(result.rowCount).toBe(2);
      expect(result.issues).toEqual([
        { fileRow: 3, code: 'requiredMissing', column: 'Mã' },
      ]);
      expect(result.rows).toHaveLength(2);
      expect(storage.deleteObject).toHaveBeenCalledWith(
        'excel-imports/7/job-1.xlsx',
      );
    });

    it('fails missingColumns with every issue and still deletes the upload (R7.5)', async () => {
      const workbook = new ExcelJS.Workbook();
      workbook.addWorksheet('x').addRow(['Other']);
      storage.getObjectBuffer.mockResolvedValue(
        Buffer.from(await workbook.xlsx.writeBuffer()),
      );

      const error = (await processor
        .runParse(parseJob())
        .catch((e: unknown) => e)) as ExcelJobError;

      expect(error.code).toBe('missingColumns');
      expect(error.errors).toEqual([
        { fileRow: 1, code: 'missingColumns', column: 'code' },
        { fileRow: 1, code: 'missingColumns', column: 'qty' },
      ]);
      expect(storage.deleteObject).toHaveBeenCalledWith(
        'excel-imports/7/job-1.xlsx',
      );
    });

    it.each([
      ['invalidFile', () => Promise.resolve(Buffer.from('not a zip'))],
      ['emptyFile', () => xlsxWithHeader([])],
      [
        'tooManyRows',
        () =>
          xlsxWithHeader(
            Array.from({ length: 10_001 }, (_, i) => [`L${i}`, i]),
          ),
      ],
    ])('fails %s as a single code (R4.4)', async (code, buffer) => {
      storage.getObjectBuffer.mockResolvedValue(await buffer());

      await expect(processor.runParse(parseJob())).rejects.toMatchObject({
        code,
        errors: undefined,
      });
      expect(storage.deleteObject).toHaveBeenCalled();
    });
  });

  it('cleanup deletes the key and succeeds when it is already gone (R8.4)', async () => {
    await processor.runCleanup(
      fakeJob({ kind: 'cleanup', s3Key: 'excel-exports/7/job-1.zip' }),
    );

    expect(storage.deleteObject).toHaveBeenCalledWith(
      'excel-exports/7/job-1.zip',
    );
  });
});
