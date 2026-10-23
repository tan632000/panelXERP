import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import {
  buildHttpAction,
  parseModuleFromPath,
  resolveHttpLog,
} from '@shared/logger/erp-log.core';

import type { HttpArgumentsHost } from '@nestjs/common/interfaces';
import type { LoggerService } from '@shared/logger/logger.service';
import type { FieldValidationError } from '@shared/utils/validation-error.util';

/** The field errors an exception body carries, or `null` when it carries none. */
function fieldErrorsOf(body: unknown): FieldValidationError[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return errors as FieldValidationError[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  /** Without it the filter still answers, but failed requests leave no access-log line. */
  constructor(private readonly httpLogger?: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    this.logFailedRequest(ctx, status);

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    // Lifted out of the nested body: a client reading field errors would otherwise have to
    // know which envelope the message happens to be wrapped in.
    const fieldErrors = fieldErrorsOf(message);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      error: typeof message === 'string' ? message : message,
      ...(fieldErrors ? { errors: fieldErrors } : {}),
    });
  }

  /**
   * `LoggingInterceptor` only sees requests that reach a handler and return; a guard refusal
   * (401, 403, 429) or a thrown exception never passes through it. Every failure ends here, so
   * this is the one place that records them.
   */
  private logFailedRequest(ctx: HttpArgumentsHost, status: number) {
    if (!this.httpLogger) return;
    const request = ctx.getRequest<Request>();
    const path = request.url;
    this.httpLogger.write(
      resolveHttpLog({
        module: parseModuleFromPath(path),
        action: buildHttpAction(request.method, path),
        message: 'Request failed',
        statusCode: status,
        context: {
          method: request.method,
          path,
          status_code: status,
        },
      }),
    );
  }
}
