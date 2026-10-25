import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PERMISSIONS_KEY } from '@kernel/core/auth/decorators/auth.decorators';
import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';

import { QuotationController } from '@plugins/sales/quotation/quotation.controller';
import { QuotationVersionService } from '@plugins/sales/quotation/services/quotation-version.service';
import { QuotationService } from '@plugins/sales/quotation/services/quotation.service';

import type { App } from 'supertest/types';

/** Stands in for the JWT guard: the actor travels in a header instead of a token. */
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    req.user = JSON.parse(req.headers['x-test-actor']) as unknown;
    return true;
  }
}

/** An actor holding exactly what the seeded role matrix grants the role. */
function actor(userId: number, role: string): string {
  const permissions = seededRolePermissions(role);
  if (!permissions) throw new Error(`Role ${role} is not seeded`);
  return JSON.stringify({ userId, role, permissions });
}

const SALES_A = actor(11, 'sales');
const MANAGER = actor(20, 'salesManager');
const ENGINEER = actor(30, 'engineer');
const LEAD = actor(40, 'engineeringLead');
const PURCHASING = actor(50, 'purchasing');
const DIRECTOR = actor(51, 'director');
const ADMIN = JSON.stringify({
  userId: 1,
  role: 'admin',
  permissions: ['*:*'],
});

interface Body {
  message: string | string[];
}
const messages = (res: request.Response): string[] => {
  const { message } = res.body as Body;
  return Array.isArray(message) ? message : [message];
};

describe('QuotationController', () => {
  let app: INestApplication<App>;
  const service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  };
  const versions = { updatePricing: jest.fn(), revise: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    for (const fn of [
      service.findAll,
      service.findOne,
      service.create,
      versions.updatePricing,
      versions.revise,
    ]) {
      fn.mockResolvedValue({ id: 1 });
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [QuotationController],
      providers: [
        { provide: QuotationService, useValue: service },
        { provide: QuotationVersionService, useValue: versions },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // The same options main.ts boots with, so a stray body field is a 400 here too.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const as = (token: string) => ({ 'x-test-actor': token });
  const server = () => app.getHttpServer();
  const get = (path: string, token: string) =>
    request(server()).get(`/sales/quotations${path}`).set(as(token));
  const post = (path: string, token: string, body: object = {}) =>
    request(server())
      .post(`/sales/quotations${path}`)
      .set(as(token))
      .send(body);
  const patch = (path: string, token: string, body: object) =>
    request(server())
      .patch(`/sales/quotations${path}`)
      .set(as(token))
      .send(body);

  describe('permissions', () => {
    it.each([
      ['findAll', 'quotation:read'],
      ['findOne', 'quotation:read'],
      ['create', 'quotation:create'],
      ['updatePricing', 'quotation:update'],
      ['revise', 'quotation:update'],
    ])('guards QuotationController.%s with %s', (handler, permission) => {
      const method = Object.getOwnPropertyDescriptor(
        QuotationController.prototype,
        handler,
      )?.value as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([
        permission,
      ]);
    });

    it('answers 403 to engineers, the engineering lead and purchasing, and calls no service', async () => {
      for (const token of [ENGINEER, LEAD, PURCHASING]) {
        await get('', token).expect(403);
        await get('/1', token).expect(403);
        await post('', token, { requestId: 1 }).expect(403);
        await patch('/1', token, { vatRate: 10 }).expect(403);
        await post('/1/revise', token).expect(403);
      }
      expect(service.findAll).not.toHaveBeenCalled();
      expect(service.create).not.toHaveBeenCalled();
      expect(versions.updatePricing).not.toHaveBeenCalled();
      expect(versions.revise).not.toHaveBeenCalled();
    });

    it('lets sales, the sales manager, the director and the administrator work', async () => {
      for (const token of [SALES_A, MANAGER, DIRECTOR, ADMIN]) {
        await get('', token).expect(200);
        await post('', token, { requestId: 1 }).expect(201);
        await patch('/1', token, { vatRate: 10 }).expect(200);
        await post('/1/revise', token).expect(200);
      }
    });
  });

  describe('create', () => {
    it('passes the request and the optional estimate revision on', async () => {
      await post('', SALES_A, { requestId: 4, estimateRevisionId: 9 }).expect(
        201,
      );

      expect(service.create).toHaveBeenCalledWith(
        { requestId: 4, estimateRevisionId: 9 },
        expect.objectContaining({ userId: 11 }),
      );
    });

    it('rejects a missing request and a stray field with 400', async () => {
      await post('', SALES_A, {}).expect(400);
      await post('', SALES_A, { requestId: 1, code: '01-01012027/BG' }).expect(
        400,
      );
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('pricing body', () => {
    it('accepts margins, a discount and a VAT rate from the allowed set', async () => {
      for (const vatRate of [0, 5, 8, 10]) {
        await patch('/1', SALES_A, {
          lines: [
            { lineId: 1, marginPercent: 12.5 },
            { lineId: 2, marginPercent: 1000 },
          ],
          discountType: 'percent',
          discountValue: 5.25,
          vatRate,
        }).expect(200);
      }
      expect(versions.updatePricing).toHaveBeenLastCalledWith(
        1,
        {
          lines: [
            { lineId: 1, marginPercent: 12.5 },
            { lineId: 2, marginPercent: 1000 },
          ],
          discountType: 'percent',
          discountValue: 5.25,
          vatRate: 10,
        },
        expect.objectContaining({ userId: 11 }),
      );
    });

    it.each([
      ['a VAT rate outside 0/5/8/10', { vatRate: 7 }],
      [
        'a margin above 1000',
        { lines: [{ lineId: 1, marginPercent: 1000.01 }] },
      ],
      ['a negative margin', { lines: [{ lineId: 1, marginPercent: -1 }] }],
      [
        'a margin with 3 decimals',
        { lines: [{ lineId: 1, marginPercent: 0.125 }] },
      ],
      ['a discount with 3 decimals', { discountValue: 1.005 }],
      ['a negative discount', { discountValue: -1 }],
      ['an unknown discount type', { discountType: 'free' }],
      ['a client-computed total', { total: 1 }],
      ['a line without an id', { lines: [{ marginPercent: 5 }] }],
    ])('rejects %s with 400 and calls no service', async (_name, body) => {
      const res = await patch('/1', SALES_A, body).expect(400);

      expect(messages(res).length).toBeGreaterThan(0);
      expect(versions.updatePricing).not.toHaveBeenCalled();
    });
  });

  describe('reads', () => {
    it('hands the version asked for to the service', async () => {
      await get('/3?ver=2', SALES_A).expect(200);

      expect(service.findOne).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ userId: 11 }),
        2,
      );
    });

    it('passes the list filters on', async () => {
      await get(
        '?status=approved&code=BG&customerId=5&search=tu&page=2',
        SALES_A,
      ).expect(200);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          code: 'BG',
          customerId: 5,
          search: 'tu',
          page: 2,
        }),
        expect.objectContaining({ userId: 11 }),
      );
    });

    it('rejects an unknown status filter with 400', async () => {
      await get('?status=bogus', SALES_A).expect(400);
    });
  });
});
