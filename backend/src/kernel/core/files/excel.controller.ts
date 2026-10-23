import { pipeline } from 'stream';

import {
  BadRequestException,
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
  Param,
  PayloadTooLargeException,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Observable, catchError, throwError } from 'rxjs';

import { CurrentUser } from '@kernel/core/auth/decorators/auth.decorators';
import {
  EXCEL_SSE_HEARTBEAT_MS,
  EXCEL_ZIP_CONTENT_TYPE,
} from '@kernel/core/files/excel-job.constants';
import { ExcelJobService } from '@kernel/core/files/excel-job.service';

import {
  EXCEL_IMPORT_MAX_FILE_BYTES,
  EXCEL_XLSX_CONTENT_TYPE,
} from '@shared/constants/excel';
import { ExcelSheetSpecDto } from '@shared/dto/excel-sheet-spec.dto';
import { ExcelWorkbookBuilder } from '@shared/services/excel-workbook.builder';
import { buildAttachmentContentDisposition } from '@shared/utils/content-disposition.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type {
  ExcelJobProgress,
  ExcelJobSnapshot,
} from '@kernel/core/files/excel-job.constants';
import type { Response } from 'express';

export class ExcelTemplateBodyDto {
  @ApiProperty({ type: ExcelSheetSpecDto })
  @ValidateNested()
  @Type(() => ExcelSheetSpecDto)
  sheet!: ExcelSheetSpecDto;
}

/** The text parts of a parse upload; `sheet` is the JSON of an `ExcelSheetSpecDto`. */
export class ExcelParseBodyDto {
  @ApiProperty({ description: 'JSON of the sheet spec the file must match' })
  @IsString()
  sheet!: string;

  @ApiPropertyOptional({ description: 'Label shown for the job' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}

/**
 * Multer reports an oversize upload as 413 before the handler runs. An import reports every
 * file problem in the same shape, so this one is re-issued as a 400 `fileTooLarge` too.
 */
@Injectable()
export class ExcelUploadLimitInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof PayloadTooLargeException
            ? new BadRequestException({
                message: 'The file is too large',
                code: 'fileTooLarge',
                errors: [{ fileRow: 1, code: 'fileTooLarge' }],
              })
            : error,
        ),
      ),
    );
  }
}

function isTerminal(snapshot: ExcelJobSnapshot): boolean {
  return snapshot.state === 'completed' || snapshot.state === 'failed';
}

/**
 * Kernel Excel routes (contract C3). Every job route answers only the job's own user;
 * authorization of the data itself stays with the feature route that queued the export.
 */
@ApiTags('excel')
@ApiBearerAuth()
@Controller('excel')
export class ExcelController {
  private readonly logger = new Logger(ExcelController.name);

  constructor(
    private readonly jobs: ExcelJobService,
    private readonly builder: ExcelWorkbookBuilder,
  ) {}

  @ApiOperation({ summary: 'Build an empty import template from a sheet spec' })
  @ApiProduces(EXCEL_XLSX_CONTENT_TYPE)
  @ApiResponse({ status: 200, description: 'Header-only workbook' })
  @ApiResponse({ status: 400, description: 'invalidSpec' })
  @Post('template')
  @HttpCode(HttpStatus.OK)
  async template(
    @Body() body: ExcelTemplateBodyDto,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.builder.buildTemplate(body.sheet);
    res.setHeader('Content-Type', EXCEL_XLSX_CONTENT_TYPE);
    res.setHeader(
      'Content-Disposition',
      buildAttachmentContentDisposition('template.xlsx'),
    );
    res.send(buffer);
  }

  @ApiOperation({
    summary: 'Queue an uploaded .xlsx to be read against a sheet spec',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sheet: { type: 'string' },
        label: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 202, description: 'Queued; returns jobId' })
  @ApiResponse({
    status: 400,
    description: 'invalidSpec, invalidFile or fileTooLarge',
  })
  @ApiResponse({ status: 429, description: 'tooManyJobs' })
  @Post('parse')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    ExcelUploadLimitInterceptor,
    FileInterceptor('file', {
      limits: { fileSize: EXCEL_IMPORT_MAX_FILE_BYTES },
    }),
  )
  parse(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ExcelParseBodyDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.jobs.enqueueParse(
      user.userId,
      file,
      body.sheet,
      body.label ?? file?.originalname ?? 'import',
    );
  }

  @ApiOperation({ summary: 'Current state of one of your Excel jobs' })
  @ApiResponse({ status: 200, description: 'Job snapshot' })
  @ApiResponse({ status: 404, description: 'jobNotFound' })
  @Get('jobs/:id')
  async snapshot(
    @Param('id') id: string,
    @CurrentUser() user: AuthUserPayload,
  ): Promise<ExcelJobSnapshot> {
    return this.jobs.snapshot(await this.jobs.getOwnedJob(id, user.userId));
  }

  @ApiOperation({
    summary: 'Server-sent events for one of your Excel jobs',
    description:
      'Sends one snapshot, then progress events, then one completed or failed event, then closes.',
  })
  @ApiProduces('text/event-stream')
  @ApiResponse({ status: 200, description: 'Event stream' })
  @ApiResponse({ status: 404, description: 'jobNotFound' })
  @Get('jobs/:id/events')
  async events(
    @Param('id') id: string,
    @CurrentUser() user: AuthUserPayload,
    @Res() res: Response,
  ): Promise<void> {
    // Thrown before any header is written, so a foreign job answers the ordinary 404.
    const first = await this.jobs.snapshot(
      await this.jobs.getOwnedJob(id, user.userId),
    );

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let closed = false;
    let terminalSent = false;
    let last: ExcelJobProgress = { stage: first.stage, percent: first.percent };
    let unwatch: () => void = () => undefined;
    const timers: { heartbeat?: NodeJS.Timeout } = {};

    const write = (event: string, data: unknown) => {
      if (!closed) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };
    const close = (end: boolean) => {
      if (closed) return;
      closed = true;
      if (timers.heartbeat) clearInterval(timers.heartbeat);
      unwatch();
      if (end) res.end();
    };
    const writeProgress = (progress: ExcelJobProgress) => {
      if (progress.percent < last.percent) return;
      if (progress.stage === last.stage && progress.percent === last.percent) {
        return;
      }
      last = progress;
      write('progress', progress);
    };
    const finish = (snapshot: ExcelJobSnapshot) => {
      if (terminalSent) return;
      terminalSent = true;
      if (snapshot.state === 'completed') {
        write('completed', snapshot.result ?? {});
      } else write('failed', snapshot.error ?? { code: 'internal' });
      close(true);
    };
    const reread = async () => {
      try {
        const snapshot = await this.jobs.snapshot(
          await this.jobs.getOwnedJob(id, user.userId),
        );
        if (isTerminal(snapshot)) finish(snapshot);
        else {
          writeProgress({ stage: snapshot.stage, percent: snapshot.percent });
        }
      } catch (error) {
        this.logger.warn(
          `Excel job ${id} could not be re-read: ${String(error)}`,
        );
        finish({ ...first, state: 'failed', error: { code: 'internal' } });
      }
    };

    write('snapshot', first);
    if (isTerminal(first)) {
      finish(first);
      return;
    }

    unwatch = this.jobs.watch(id, (event) => {
      if (event.type === 'progress') writeProgress(event.progress);
      else void reread();
    });
    timers.heartbeat = setInterval(() => {
      if (!closed) res.write(': ping\n\n');
    }, EXCEL_SSE_HEARTBEAT_MS);
    // The response closes when the client goes away; the request may close earlier, as soon
    // as its (empty) body has been read.
    res.on('close', () => close(false));

    // Covers a job that moved on between the first read and the subscription.
    await reread();
  }

  @ApiOperation({ summary: 'Rows read by one of your finished parse jobs' })
  @ApiResponse({ status: 200, description: 'Keyed rows' })
  @ApiResponse({ status: 404, description: 'jobNotFound' })
  @ApiResponse({ status: 409, description: 'jobNotCompleted' })
  @Get('jobs/:id/result')
  async result(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    const rows = await this.jobs.parseRows(
      await this.jobs.getOwnedJob(id, user.userId),
    );
    return { rows };
  }

  @ApiOperation({
    summary: 'Download the zip of one of your finished exports, once',
    description:
      'The stored file is deleted as soon as this download completes, or 30 minutes after it was ready.',
  })
  @ApiProduces(EXCEL_ZIP_CONTENT_TYPE)
  @ApiResponse({ status: 200, description: 'Zip stream' })
  @ApiResponse({ status: 404, description: 'jobNotFound' })
  @ApiResponse({ status: 409, description: 'jobNotCompleted' })
  @ApiResponse({ status: 410, description: 'fileExpired' })
  @Get('jobs/:id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthUserPayload,
    @Res() res: Response,
  ): Promise<void> {
    const job = await this.jobs.getOwnedJob(id, user.userId);
    const { stream, fileName } = await this.jobs.openDownload(job);

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', EXCEL_ZIP_CONTENT_TYPE);
    res.setHeader(
      'Content-Disposition',
      buildAttachmentContentDisposition(fileName),
    );
    // `pipeline` destroys the S3 object stream as soon as `res` closes (an aborted download,
    // say), unlike a plain `.pipe()`, which would leave it open and paused, holding its
    // socket. Its callback fires exactly once: with no error once every byte was handed off,
    // consuming the file (C3); with an error otherwise, which releases the one-shot download
    // claim (M3) so a retry can still download, and its file stays until the cleanup job
    // removes it.
    pipeline(stream, res, (error) => {
      if (!error) {
        void this.jobs
          .markDownloaded(job)
          .catch((cause: unknown) =>
            this.logger.warn(
              `Excel download ${id} could not be consumed: ${String(cause)}`,
            ),
          );
        return;
      }
      if (error.message !== 'Premature close') {
        this.logger.warn(
          `Excel download ${id} stream failed: ${String(error)}`,
        );
      }
      void this.jobs
        .releaseDownloadClaim(id)
        .catch((cause: unknown) =>
          this.logger.warn(
            `Excel download ${id} claim could not be released: ${String(cause)}`,
          ),
        );
    });
  }
}
