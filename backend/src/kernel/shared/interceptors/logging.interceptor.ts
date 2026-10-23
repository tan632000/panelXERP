import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

import {
  buildHttpAction,
  parseModuleFromPath,
  resolveHttpLog,
} from '@shared/logger/erp-log.core';
import { LoggerService } from '@shared/logger/logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method: string; url: string }>();
    const response = http.getResponse<{ statusCode: number }>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const statusCode = response.statusCode;
        const failed = statusCode >= 400;

        this.logger.write(
          resolveHttpLog({
            module: parseModuleFromPath(request.url),
            action: buildHttpAction(request.method, request.url),
            message: failed ? 'Request failed' : 'Request completed',
            statusCode,
            durationMs: Date.now() - start,
            context: {
              method: request.method,
              path: request.url,
              status_code: statusCode,
            },
          }),
        );
      }),
    );
  }
}
