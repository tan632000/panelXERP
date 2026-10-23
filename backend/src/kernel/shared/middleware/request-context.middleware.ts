import { randomUUID } from 'crypto';

import { Injectable, NestMiddleware } from '@nestjs/common';

import { RequestContextStore } from '@shared/context/request-context.store';

import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ||
      `req_${randomUUID()}`;
    const traceId =
      (req.headers['x-trace-id'] as string | undefined) || requestId;

    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);
    Object.assign(req, { requestId, traceId });

    RequestContextStore.run(
      {
        requestId,
        traceId,
        ip: req.ip,
      },
      () => next(),
    );
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    traceId?: string;
  }
}
