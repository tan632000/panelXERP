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

import { OrderController } from '@plugins/sales/order/order.controller';
import { OrderConvertService } from '@plugins/sales/order/services/order-convert.service';
import { OrderEditService } from '@plugins/sales/order/services/order-edit.service';
import { OrderService } from '@plugins/sales/order/services/order.service';

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

const SALES = actor(11, 'sales');
const MANAGER = actor(20, 'salesManager');
const DIRECTOR = actor(51, 'director');
const ENGINEER = actor(30, 'engineer');
const LEAD = actor(40, 'engineeringLead');
const PURCHASING = actor(50, 'purchasing');
const ADMIN = JSON.stringify({
  userId: 1,
  role: 'admin',
  permissions: ['*:*'],
});

describe('OrderController', () => {
  let app: INestApplication<App>;
  const service = { findAll: jest.fn(), findOne: jest.fn() };
  const converter = { convert: jest.fn() };
  const editor = { update: jest.fn(), cancel: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    for (const fn of [
      service.findAll,
      service.findOne,
      converter.convert,
      editor.update,
      editor.cancel,
    ]) {
      fn.mockResolvedValue({ id: 1 });
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderService, useValue: service },
        { provide: OrderConvertService, useValue: converter },
        { provide: OrderEditService, useValue: editor },
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
    request(server()).get(`/sales/orders${path}`).set(as(token));
  const post = (path: string, token: string, body: object = {}) =>
    request(server()).post(`/sales/orders${path}`).set(as(token)).send(body);
  const patch = (path: string, token: string, body: object) =>
    request(server()).patch(`/sales/orders${path}`).set(as(token)).send(body);

  describe('permissions', () => {
    it.each([
      ['findAll', 'order:read'],
      ['findOne', 'order:read'],
      ['create', 'order:create'],
      ['update', 'order:update'],
      ['cancel', 'order:cancel'],
    ])('guards OrderController.%s with %s', (handler, permission) => {
      const method = Object.getOwnPropertyDescriptor(
        OrderController.prototype,
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
        await post('', token, { quotationId: 1 }).expect(403);
        await patch('/1', token, { contractNo: 'HD-1' }).expect(403);
        await post('/1/cancel', token, { reason: 'x' }).expect(403);
      }
      expect(service.findAll).not.toHaveBeenCalled();
      expect(converter.convert).not.toHaveBeenCalled();
      expect(editor.update).not.toHaveBeenCalled();
      expect(editor.cancel).not.toHaveBeenCalled();
    });

    it('lets sales read, convert and edit but not cancel an order', async () => {
      await get('', SALES).expect(200);
      await get('/1', SALES).expect(200);
      await post('', SALES, { quotationId: 1 }).expect(201);
      await patch('/1', SALES, { contractNo: 'HD-1' }).expect(200);
      await post('/1/cancel', SALES, { reason: 'x' }).expect(403);
      expect(editor.update).toHaveBeenCalledTimes(1);
      expect(editor.cancel).not.toHaveBeenCalled();
    });

    it('lets the sales manager, the director and the administrator do everything', async () => {
      for (const token of [MANAGER, DIRECTOR, ADMIN]) {
        await get('', token).expect(200);
        await post('', token, { quotationId: 1 }).expect(201);
        await patch('/1', token, { contractNo: 'HD-1' }).expect(200);
        await post('/1/cancel', token, { reason: 'x' }).expect(200);
      }
    });
  });

  describe('validation', () => {
    it('requires a quotation id to convert, and a calendar date for the dates', async () => {
      await post('', MANAGER, {}).expect(400);
      await post('', MANAGER, {
        quotationId: 1,
        contractDate: '15/02/2027',
      }).expect(400);
      await post('', MANAGER, { quotationId: 1, deliveryDate: 'soon' }).expect(
        400,
      );
      expect(converter.convert).not.toHaveBeenCalled();
    });

    it('accepts the optional contract fields on conversion', async () => {
      await post('', MANAGER, {
        quotationId: 1,
        contractNo: 'HD-01',
        contractDate: '2027-01-20',
        deliveryDate: '2027-02-15',
      }).expect(201);
      expect(converter.convert).toHaveBeenCalledTimes(1);
    });

    it('edits only the three header fields: a line, price or total is a 400', async () => {
      for (const body of [
        { total: 1 },
        { lines: [] },
        { terms: ['x'] },
        { customerName: 'Other' },
        { quotationId: 2 },
      ]) {
        await patch('/1', MANAGER, body).expect(400);
      }
      expect(editor.update).not.toHaveBeenCalled();
    });

    it('requires a reason to cancel', async () => {
      await post('/1/cancel', MANAGER, {}).expect(400);
      await post('/1/cancel', MANAGER, { reason: 5 }).expect(400);
      expect(editor.cancel).not.toHaveBeenCalled();
    });
  });
});
