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
import { QuotationApprovalService } from '@plugins/sales/quotation/services/quotation-approval.service';
import { QuotationFeedbackService } from '@plugins/sales/quotation/services/quotation-feedback.service';
import { QuotationPdfService } from '@plugins/sales/quotation/services/quotation-pdf.service';
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
  const versions = {
    updatePricing: jest.fn(),
    revise: jest.fn(),
    refreshEstimate: jest.fn(),
  };
  const approvals = {
    submit: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    confirm: jest.fn(),
    cancel: jest.fn(),
  };
  const feedback = { list: jest.fn(), add: jest.fn() };
  const exports = { exportXlsx: jest.fn(), exportPdf: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    for (const fn of [
      service.findAll,
      service.findOne,
      service.create,
      versions.updatePricing,
      versions.revise,
      versions.refreshEstimate,
      ...Object.values(approvals),
      ...Object.values(feedback),
    ]) {
      fn.mockResolvedValue({ id: 1 });
    }
    exports.exportXlsx.mockResolvedValue({
      fileName: '03-25102026-BG.xlsx',
      contentType: 'application/xlsx-test',
      body: Buffer.from('xlsx'),
    });
    exports.exportPdf.mockResolvedValue({
      fileName: '03-25102026-BG.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-'),
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [QuotationController],
      providers: [
        { provide: QuotationService, useValue: service },
        { provide: QuotationVersionService, useValue: versions },
        { provide: QuotationApprovalService, useValue: approvals },
        { provide: QuotationFeedbackService, useValue: feedback },
        { provide: QuotationPdfService, useValue: exports },
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
      ['refreshEstimate', 'quotation:update'],
      ['submit', 'quotation:submit'],
      ['approve', 'quotation:approve'],
      ['reject', 'quotation:approve'],
      ['confirm', 'quotation:confirm'],
      ['cancel', 'quotation:cancel'],
      ['listFeedback', 'quotation:read'],
      ['addFeedback', 'quotation:update'],
      ['exportXlsx', 'quotation:export'],
      ['exportPdf', 'quotation:export'],
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

  describe('approval, feedback and export', () => {
    const actions: Array<[string, string, object?]> = [
      ['post', '/1/submit'],
      ['post', '/1/approve'],
      ['post', '/1/reject', { reason: 'No' }],
      ['post', '/1/confirm'],
      ['post', '/1/cancel', { reason: 'No' }],
      ['post', '/1/refresh-estimate'],
      ['get', '/1/feedback'],
      [
        'post',
        '/1/feedback',
        { feedbackDate: '2027-01-10', channel: 'phone', content: 'Ok' },
      ],
      ['get', '/1/export.xlsx'],
      ['get', '/1/export.pdf'],
    ];
    const call = (
      [method, path, body]: [string, string, object?],
      token: string,
    ) => (method === 'get' ? get(path, token) : post(path, token, body ?? {}));

    it('answers 403 to engineers, the engineering lead and purchasing on every action', async () => {
      for (const token of [ENGINEER, LEAD, PURCHASING]) {
        for (const action of actions) {
          await call(action, token).expect(403);
        }
      }
      for (const fn of [
        ...Object.values(approvals),
        ...Object.values(feedback),
        ...Object.values(exports),
        versions.refreshEstimate,
      ]) {
        expect(fn).not.toHaveBeenCalled();
      }
    });

    it('lets sales submit, confirm, cancel, take notes and export, but never approve or reject', async () => {
      await post('/1/submit', SALES_A).expect(200);
      await post('/1/confirm', SALES_A).expect(200);
      await post('/1/cancel', SALES_A, { reason: 'No' }).expect(200);
      await post('/1/refresh-estimate', SALES_A).expect(200);
      await get('/1/feedback', SALES_A).expect(200);
      await get('/1/export.xlsx', SALES_A).expect(200);
      await get('/1/export.pdf', SALES_A).expect(200);

      await post('/1/approve', SALES_A).expect(403);
      await post('/1/reject', SALES_A, { reason: 'No' }).expect(403);
      expect(approvals.approve).not.toHaveBeenCalled();
      expect(approvals.reject).not.toHaveBeenCalled();
    });

    it('lets the sales manager, the director and the administrator approve and reject', async () => {
      for (const token of [MANAGER, DIRECTOR, ADMIN]) {
        await post('/1/approve', token).expect(200);
        await post('/1/reject', token, { reason: 'No' }).expect(200);
      }
      expect(approvals.approve).toHaveBeenCalledTimes(3);
      expect(approvals.reject).toHaveBeenCalledTimes(3);
    });

    it('hands the reason to reject and cancel, and refuses a missing or blank one with 400', async () => {
      await post('/1/reject', MANAGER, { reason: '  Too thin  ' }).expect(200);
      expect(approvals.reject).toHaveBeenCalledWith(
        1,
        { reason: 'Too thin' },
        expect.objectContaining({ userId: 20 }),
      );

      for (const path of ['/1/reject', '/1/cancel']) {
        await post(path, MANAGER, {}).expect(400);
        await post(path, MANAGER, { reason: '   ' }).expect(400);
      }
      expect(approvals.cancel).not.toHaveBeenCalled();
    });

    it('validates the feedback body', async () => {
      await post('/1/feedback', SALES_A, {
        feedbackDate: '2027-01-10',
        channel: 'phone',
        content: '  Wants a discount ',
      }).expect(201);
      expect(feedback.add).toHaveBeenCalledWith(
        1,
        {
          feedbackDate: '2027-01-10',
          channel: 'phone',
          content: 'Wants a discount',
        },
        expect.objectContaining({ userId: 11 }),
      );

      for (const body of [
        { channel: 'phone', content: 'x' },
        { feedbackDate: '2027-01-10', content: 'x' },
        { feedbackDate: '2027-01-10', channel: 'phone' },
        { feedbackDate: '2027-01-10', channel: 'smoke', content: 'x' },
        { feedbackDate: '10/01/2027', channel: 'phone', content: 'x' },
        { feedbackDate: '2027-01-10', channel: 'phone', content: ' ' },
        { feedbackDate: '2027-01-10', channel: 'phone', content: 'x', by: 1 },
      ]) {
        await post('/1/feedback', SALES_A, body).expect(400);
      }
      expect(feedback.add).toHaveBeenCalledTimes(1);
    });

    it('accepts the printed terms in the pricing body and rejects blank ones', async () => {
      await patch('/1', SALES_A, {
        terms: ['Warranty 12 months', ' Net 30 '],
      }).expect(200);
      expect(versions.updatePricing).toHaveBeenCalledWith(
        1,
        { terms: ['Warranty 12 months', 'Net 30'] },
        expect.objectContaining({ userId: 11 }),
      );

      await patch('/1', SALES_A, { terms: ['ok', ' '] }).expect(400);
      await patch('/1', SALES_A, { terms: 'one line' }).expect(400);
      await patch('/1', SALES_A, {
        terms: Array.from({ length: 21 }, () => 'term'),
      }).expect(400);
      expect(versions.updatePricing).toHaveBeenCalledTimes(1);
    });

    it('serves the exports as attachments with the right content type', async () => {
      const xlsx = await get('/1/export.xlsx', SALES_A).expect(200);
      expect(xlsx.headers['content-type']).toContain('application/xlsx-test');
      expect(xlsx.headers['content-disposition']).toContain('attachment');
      expect(xlsx.headers['content-disposition']).toContain(
        '03-25102026-BG.xlsx',
      );

      const pdf = await get('/1/export.pdf', SALES_A).expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.headers['content-disposition']).toContain(
        '03-25102026-BG.pdf',
      );
    });
  });
});
