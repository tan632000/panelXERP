import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

import { AuditTrailService } from '@shared/audit/audit-trail.service';
import { parseModuleFromPath } from '@shared/logger/erp-log.core';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditTrail: AuditTrailService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      body?: Record<string, unknown>;
      headers?: Record<string, string | string[] | undefined>;
    }>();

    const method = request.method?.toUpperCase();
    if (!method || ['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        this.auditTrail.record({
          module: parseModuleFromPath(request.url),
          action: method.toLowerCase(),
          targetType: 'http_request',
          message: 'HTTP mutation recorded',
          context: {
            path: request.url,
            body: request.body,
            user_agent: String(request.headers?.['user-agent'] || ''),
          },
        });
      }),
    );
  }
}
