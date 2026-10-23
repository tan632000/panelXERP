import { get } from 'http';
import { Readable } from 'stream';

import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';

import { ExcelJobService } from '@kernel/core/files/excel-job.service';
import { ExcelController } from '@kernel/core/files/excel.controller';

import { HttpExceptionFilter } from '@shared/filters/http-exception.filter';
import { ExcelWorkbookBuilder } from '@shared/services/excel-workbook.builder';
import { validationExceptionFactory } from '@shared/utils/validation-error.util';

import type { ExcelJobSnapshot } from '@kernel/core/files/excel-job.constants';
import type { ExcelJobEvent } from '@kernel/core/files/excel-job.service';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

const SHEET = {
  columns: [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B', headerGroup: ['G'] },
    { key: 'c', label: 'C', headerGroup: ['G'] },
  ],
};

function snapshot(overrides: Partial<ExcelJobSnapshot> = {}): ExcelJobSnapshot {
  return {
    id: 'job-1',
    kind: 'export',
    label: 'Dịch vụ',
    state: 'active',
    stage: 'querying',
    percent: 5,
    ...overrides,
  };
}

/** SSE frames of a response body: `[event, data]` pairs plus comment lines. */
function frames(body: string): Array<[string, unknown] | string> {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith(':')) return block;
      const [eventLine, dataLine] = block.split('\n');
      return [
        eventLine.slice('event: '.length),
        JSON.parse(dataLine.slice('data: '.length)),
      ];
    });
}

describe('ExcelController', () => {
  let app: INestApplication;
  let jobs: {
    enqueueParse: jest.Mock;
    getOwnedJob: jest.Mock;
    snapshot: jest.Mock;
    watch: jest.Mock;
    parseRows: jest.Mock;
    openDownload: jest.Mock;
    markDownloaded: jest.Mock;
    releaseDownloadClaim: jest.Mock;
  };
  let listener: ((event: ExcelJobEvent) => void) | undefined;
  const httpServer = () => app.getHttpServer() as Server;

  beforeEach(async () => {
    listener = undefined;
    jobs = {
      enqueueParse: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
      getOwnedJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
      snapshot: jest.fn(),
      watch: jest.fn((_id: string, fn: (event: ExcelJobEvent) => void) => {
        listener = fn;
        return jest.fn();
      }),
      parseRows: jest.fn(),
      openDownload: jest.fn(),
      markDownloaded: jest.fn().mockResolvedValue(undefined),
      releaseDownloadClaim: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ExcelController],
      providers: [
        { provide: ExcelJobService, useValue: jobs },
        ExcelWorkbookBuilder,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Stands in for the global JWT guard: every request is user 7.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: object }).user = { userId: 7 };
      next();
    });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await app.close();
  });

  it('builds a header-only template through the builder (R5.1)', async () => {
    const response = await request(httpServer())
      .post('/excel/template')
      .send({ sheet: SHEET })
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getCell('B1').value).toBe('G');
    expect(sheet.getCell('C2').value).toBe('C');
  });

  it('queues a parse upload with 202 and the caller as owner (R7.1)', async () => {
    const response = await request(httpServer())
      .post('/excel/parse')
      .field('sheet', JSON.stringify(SHEET))
      .field('label', 'lenh.xlsx')
      .attach('file', Buffer.from('xlsx'), 'lenh.xlsx')
      .expect(202);

    expect(response.body).toEqual({ jobId: 'job-1' });
    expect(jobs.enqueueParse).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ originalname: 'lenh.xlsx' }),
      JSON.stringify(SHEET),
      'lenh.xlsx',
    );
  });

  it('answers a 6 MB upload with 400 fileTooLarge and queues nothing (R4.4)', async () => {
    const response = await request(httpServer())
      .post('/excel/parse')
      .field('sheet', JSON.stringify(SHEET))
      .attach('file', Buffer.alloc(6 * 1024 * 1024), 'big.xlsx')
      .expect(400);

    expect((response.body as { error: unknown }).error).toMatchObject({
      code: 'fileTooLarge',
    });
    expect(jobs.enqueueParse).not.toHaveBeenCalled();
  });

  it('streams snapshot, progress, then one terminal event and closes (R7.2)', async () => {
    jobs.snapshot
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(
        snapshot({
          state: 'completed',
          stage: 'done',
          percent: 100,
          result: {
            fileName: 'DichVu',
            sizeBytes: 10,
            expiresAt: '2026-09-24T04:00:00.000Z',
            downloaded: false,
          },
        }),
      );

    const pending = request(httpServer()).get('/excel/jobs/job-1/events');
    const drive = (async () => {
      while (!listener) await new Promise((resolve) => setTimeout(resolve, 5));
      listener({
        type: 'progress',
        progress: { stage: 'writing', percent: 40 },
      });
      listener({
        type: 'progress',
        progress: { stage: 'writing', percent: 30 },
      });
      listener({
        type: 'progress',
        progress: { stage: 'writing', percent: 40 },
      });
      listener({
        type: 'progress',
        progress: { stage: 'uploading', percent: 95 },
      });
      listener({ type: 'terminal' });
    })();

    const response = await pending;
    await drive;

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(frames(response.text)).toEqual([
      ['snapshot', snapshot()],
      ['progress', { stage: 'writing', percent: 40 }],
      ['progress', { stage: 'uploading', percent: 95 }],
      ['completed', expect.objectContaining({ fileName: 'DichVu' })],
    ]);
  });

  it('ends at once for a job that is already terminal', async () => {
    jobs.snapshot.mockResolvedValue(
      snapshot({ state: 'failed', error: { code: 'exportTooLarge' } }),
    );

    const response = await request(httpServer())
      .get('/excel/jobs/job-1/events')
      .expect(200);

    expect(frames(response.text)).toEqual([
      ['snapshot', expect.objectContaining({ state: 'failed' })],
      ['failed', { code: 'exportTooLarge' }],
    ]);
    expect(jobs.watch).not.toHaveBeenCalled();
  });

  it('writes a heartbeat comment every 15 seconds while the job runs', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jobs.snapshot.mockResolvedValue(snapshot());
    const server = httpServer();
    const chunks: string[] = [];

    const req = request(server)
      .get('/excel/jobs/job-1/events')
      .buffer(false)
      .parse((res, done) => {
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk.toString());
          if (chunk.toString().includes(': ping')) {
            listener?.({ type: 'terminal' });
          }
        });
        res.on('end', () => done(null, chunks.join('')));
      });
    const done = req.then((res) => res);

    while (!listener) {
      jest.advanceTimersByTime(1);
      await new Promise((resolve) => setImmediate(resolve));
    }
    jobs.snapshot.mockResolvedValue(
      snapshot({
        state: 'completed',
        stage: 'done',
        percent: 100,
        result: { rowCount: 1 },
      }),
    );
    jest.advanceTimersByTime(15_000);
    await done;

    expect(chunks.join('')).toContain(': ping\n\n');
  });

  it('answers a foreign job with 404 before any stream bytes (R7.3)', async () => {
    jobs.getOwnedJob.mockRejectedValue(
      new NotFoundException({ message: 'Job not found', code: 'jobNotFound' }),
    );

    const response = await request(httpServer())
      .get('/excel/jobs/job-1/events')
      .expect(404);

    expect(response.headers['content-type']).toContain('application/json');
    expect((response.body as { error: unknown }).error).toMatchObject({
      code: 'jobNotFound',
    });
  });

  it('consumes the file after a download streamed to the end (R8.3)', async () => {
    jobs.openDownload.mockResolvedValue({
      stream: Readable.from([Buffer.from('zip-bytes')]),
      fileName: 'DichVu.zip',
    });

    const response = await request(httpServer())
      .get('/excel/jobs/job-1/download')
      .expect(200);

    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toContain('DichVu.zip');
    await new Promise((resolve) => setImmediate(resolve));
    expect(jobs.markDownloaded).toHaveBeenCalledTimes(1);
  });

  it('keeps the file when the download is aborted part way', async () => {
    const endless = new Readable({ read() {} });
    endless.push(Buffer.alloc(1024));
    jobs.openDownload.mockResolvedValue({
      stream: endless,
      fileName: 'DichVu.zip',
    });

    const server = httpServer().listen(0);
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => {
      const req = get(
        `http://127.0.0.1:${port}/excel/jobs/job-1/download`,
        (res) => {
          // Drop the connection after the first chunk, as a closed browser tab would.
          res.once('data', () => {
            req.destroy();
            resolve();
          });
        },
      );
      req.on('error', () => resolve());
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(jobs.markDownloaded).not.toHaveBeenCalled();
    // `pipeline` destroys the S3 source stream once the response closes, instead of leaving
    // it paused and holding its socket (M2).
    expect(endless.destroyed).toBe(true);
    // The one-shot download claim is released on abort, so a retry can still download (M3).
    expect(jobs.releaseDownloadClaim).toHaveBeenCalledWith('job-1');
    server.close();
  });

  it('returns parsed rows for a finished parse job', async () => {
    jobs.parseRows.mockResolvedValue([{ fileRow: 2, values: { a: 'x' } }]);

    const response = await request(httpServer())
      .get('/excel/jobs/job-1/result')
      .expect(200);

    expect(response.body).toEqual({
      rows: [{ fileRow: 2, values: { a: 'x' } }],
    });
  });
});
