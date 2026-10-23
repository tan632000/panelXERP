import { ConflictException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import { validationExceptionFactory } from '@shared/utils/validation-error.util';

import { HttpExceptionFilter } from './http-exception.filter';

import type { ArgumentsHost } from '@nestjs/common';
import type { ErpLogInput } from '@shared/logger/erp-log.types';
import type { LoggerService } from '@shared/logger/logger.service';

function hostWithResponse() {
  const json = jest.fn<void, [Record<string, unknown>]>();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/api/v1/products/38' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  it('lifts field errors out of the nested body', () => {
    const { host, status, json } = hostWithResponse();
    const exception = validationExceptionFactory([
      {
        property: 'code',
        constraints: { isNotEmpty: 'code should not be empty' },
      },
    ]);

    new HttpExceptionFilter().catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body).toMatchObject({
      statusCode: 400,
      errors: [{ field: 'code', message: 'code should not be empty' }],
    });
  });

  it('leaves a body that carries no field errors untouched', () => {
    const { host, json } = hostWithResponse();

    new HttpExceptionFilter().catch(
      new ConflictException('Material code already exists.'),
      host,
    );

    expect(json.mock.calls[0][0]).not.toHaveProperty('errors');
  });

  it('records a refused request, which never reaches the logging interceptor', () => {
    const { host } = hostWithResponse();
    const write = jest.fn<void, [ErpLogInput]>();

    new HttpExceptionFilter({ write } as unknown as LoggerService).catch(
      new ThrottlerException(),
      host,
    );

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toMatchObject({
      level: 'warn',
      status: 'failed',
      module: 'products',
      errorCode: `HTTP_${HttpStatus.TOO_MANY_REQUESTS}`,
      context: { method: 'GET', path: '/api/v1/products/38' },
    });
  });
});
