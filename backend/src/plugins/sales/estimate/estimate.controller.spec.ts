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

import {
  buildEstimateFixture,
  type EstimateFixture,
} from '@plugins/sales/estimate/estimate-fixture.helper-spec';
import { EstimateController } from '@plugins/sales/estimate/estimate.controller';
import { EstimateEditService } from '@plugins/sales/estimate/services/estimate-edit.service';
import { EstimateService } from '@plugins/sales/estimate/services/estimate.service';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

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
const SALES_B = actor(12, 'sales');
const MANAGER = actor(20, 'salesManager');
const ENGINEER_A = actor(30, 'engineer');
const ENGINEER_B = actor(31, 'engineer');
const LEAD = actor(40, 'engineeringLead');
const PURCHASING = actor(50, 'purchasing');
const DIRECTOR = actor(51, 'director');
const ADMIN = JSON.stringify({
  userId: 1,
  role: 'admin',
  permissions: ['*:*'],
});

interface PanelBody {
  id: number;
  tag: string;
  unitCost: number;
  total: number;
  bomLines: Array<{ id: number; amount: number; itemCode: string }>;
  costLines: Array<{ id: number }>;
}
interface Body {
  id: number;
  code: string;
  status: string;
  total: number;
  message: string | string[];
  data: Array<{ id: number }>;
  panels: PanelBody[];
  current: { panels: PanelBody[]; status: string; revision: number };
  latestRevision: number;
}
const bodyOf = (res: request.Response): Body => res.body as Body;

describe('EstimateController', () => {
  let app: INestApplication<App>;
  let fixture: EstimateFixture;
  let requestId: number;
  let itemId: number;

  beforeEach(async () => {
    fixture = buildEstimateFixture({ registerReferenceChecks: false });
    requestId = fixture.requestAt(RequestStatus.ASSIGNED, {
      salesOwnerId: 11,
      assignedEngineerId: 30,
    }).id;
    itemId = fixture.itemOf({ referencePrice: 1000 }).id;

    const moduleRef = await Test.createTestingModule({
      controllers: [EstimateController],
      providers: [
        { provide: EstimateService, useValue: fixture.service },
        { provide: EstimateEditService, useValue: fixture.editor },
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
  const post = (path: string, token: string, body: object = {}) =>
    request(server()).post(`/sales/estimates${path}`).set(as(token)).send(body);
  const patch = (path: string, token: string, body: object) =>
    request(server())
      .patch(`/sales/estimates${path}`)
      .set(as(token))
      .send(body);
  const del = (path: string, token: string) =>
    request(server()).delete(`/sales/estimates${path}`).set(as(token));
  const get = (path: string, token: string) =>
    request(server()).get(`/sales/estimates${path}`).set(as(token));

  const start = async (token = ENGINEER_A) =>
    bodyOf(await post('', token, { requestId }).expect(201));

  describe('permissions', () => {
    it.each([
      ['findAll', 'estimate:read'],
      ['findOne', 'estimate:read'],
      ['create', 'estimate:create'],
      ['revise', 'estimate:create'],
      ['submit', 'estimate:submit'],
      ['addPanel', 'estimate:update'],
      ['updatePanel', 'estimate:update'],
      ['deletePanel', 'estimate:update'],
      ['addBomLine', 'estimate:update'],
      ['updateBomLine', 'estimate:update'],
      ['deleteBomLine', 'estimate:update'],
      ['addCostLine', 'estimate:update'],
      ['updateCostLine', 'estimate:update'],
      ['deleteCostLine', 'estimate:update'],
    ])('guards EstimateController.%s with %s', (handler, permission) => {
      const method = Object.getOwnPropertyDescriptor(
        EstimateController.prototype,
        handler,
      )?.value as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([
        permission,
      ]);
    });

    it('answers 403 to an actor lacking estimate:update, and changes nothing', async () => {
      const made = await start();

      // Sales and the sales manager only read estimates; purchasing holds no estimate scope.
      for (const token of [SALES_A, MANAGER, PURCHASING]) {
        await post(`/${made.id}/panels`, token, {
          tag: 'MSB-01',
          quantity: 1,
        }).expect(403);
      }
      await patch(`/${made.id}/panels/1`, SALES_A, { quantity: 2 }).expect(403);
      await del(`/${made.id}/panels/1`, SALES_A).expect(403);
      await post(`/${made.id}/submit`, SALES_A).expect(403);
      await post(`/${made.id}/revise`, MANAGER).expect(403);
      await post('', SALES_A, { requestId }).expect(403);
      await get(`/${made.id}`, PURCHASING).expect(403);
      expect(fixture.panels.rows).toHaveLength(0);
    });

    it('answers 403 to the director and 404 to the administrator on a BOM line edit, and 200 to the engineering lead', async () => {
      const made = await start();
      const panelId = bodyOf(
        await post(`/${made.id}/panels`, ENGINEER_A, {
          tag: 'P',
          quantity: 1,
        }).expect(201),
      ).panels[0].id;
      const withLine = bodyOf(
        await post(`/${made.id}/panels/${panelId}/bom-lines`, ENGINEER_A, {
          itemId,
          quantity: 1,
        }).expect(201),
      );
      const lineId = withLine.panels[0].bomLines[0].id;

      // The director reads estimates but lacks every write permission.
      await patch(`/${made.id}/bom-lines/${lineId}`, DIRECTOR, {
        quantity: 2,
      }).expect(403);
      await get(`/${made.id}`, DIRECTOR).expect(200);
      // The administrator holds every permission, yet is not a writer of the estimate.
      await patch(`/${made.id}/bom-lines/${lineId}`, ADMIN, {
        quantity: 2,
      }).expect(404);
      await get(`/${made.id}`, ADMIN).expect(200);
      await patch(`/${made.id}/bom-lines/${lineId}`, LEAD, {
        quantity: 2,
      }).expect(200);
    });

    it('answers 404 to the permission-holding engineer B for every write, leaving no trace', async () => {
      const made = await start();

      await post(`/${made.id}/panels`, ENGINEER_B, {
        tag: 'MSB-01',
        quantity: 1,
      }).expect(404);
      await post(`/${made.id}/submit`, ENGINEER_B).expect(404);
      await post(`/${made.id}/revise`, ENGINEER_B).expect(404);
      await get(`/${made.id}`, ENGINEER_B).expect(404);
      expect(fixture.panels.rows).toHaveLength(0);
    });
  });

  describe('the whole flow over HTTP', () => {
    it('builds, submits, refuses edits, and revises', async () => {
      const made = await start();
      expect(made).toMatchObject({
        code: expect.stringMatching(/^DT_\d{4}_0001$/) as string,
        status: 'draft',
        current: { revision: 1, status: 'draft' },
      });

      const panelRes = await post(`/${made.id}/panels`, ENGINEER_A, {
        tag: ' MSB-01 ',
        description: 'Main board',
        quantity: 2,
      }).expect(201);
      const panelId = bodyOf(panelRes).panels[0].id;
      expect(bodyOf(panelRes).panels[0].tag).toBe('MSB-01');

      await post(`/${made.id}/panels/${panelId}/bom-lines`, ENGINEER_A, {
        itemId,
        quantity: 12.5,
      }).expect(201);
      const costRes = await post(
        `/${made.id}/panels/${panelId}/cost-lines`,
        ENGINEER_A,
        { category: 'labor', amount: 1200000 },
      ).expect(201);
      // (12.5 × 1,000 + 1,200,000) × 2 panels
      expect(bodyOf(costRes)).toMatchObject({
        total: 2425000,
        panels: [{ unitCost: 1212500, total: 2425000 }],
      });

      const submitted = await post(`/${made.id}/submit`, ENGINEER_A).expect(
        200,
      );
      expect(bodyOf(submitted)).toMatchObject({
        status: 'submitted',
        total: 2425000,
      });
      expect(fixture.requests.rows[0].status).toBe(RequestStatus.ESTIMATED);
      expect(fixture.notifications.emit).toHaveBeenCalledTimes(1);

      const lineId = bodyOf(costRes).panels[0].bomLines[0].id;
      await post(`/${made.id}/panels`, ENGINEER_A, {
        tag: 'MSB-02',
        quantity: 1,
      }).expect(409);
      await patch(`/${made.id}/bom-lines/${lineId}`, ENGINEER_A, {
        quantity: 1,
      }).expect(409);
      await del(`/${made.id}/panels/${panelId}`, LEAD).expect(409);
      await post(`/${made.id}/submit`, ENGINEER_A).expect(409);

      const revised = await post(`/${made.id}/revise`, ENGINEER_A).expect(200);
      expect(bodyOf(revised)).toMatchObject({
        status: 'draft',
        latestRevision: 2,
        current: { revision: 2, status: 'draft' },
      });
      await post(`/${made.id}/revise`, ENGINEER_A).expect(409);
    });

    it('lets Sales A read their estimate (200) and Sales B not (404); lists follow the scope', async () => {
      const made = await start();

      await get(`/${made.id}`, SALES_A).expect(200);
      await get(`/${made.id}`, SALES_B).expect(404);
      await get(`/${made.id}?revision=3`, SALES_A).expect(404);

      const own = await get('', SALES_A).expect(200);
      expect(bodyOf(own).data.map((row) => row.id)).toEqual([made.id]);
      const others = await get('', SALES_B).expect(200);
      expect(bodyOf(others).data).toEqual([]);
      const engineerB = await get('', ENGINEER_B).expect(200);
      expect(bodyOf(engineerB).data).toEqual([]);
      const filtered = await get(
        `?status=draft&requestId=${requestId}`,
        LEAD,
      ).expect(200);
      expect(bodyOf(filtered).data).toHaveLength(1);
    });
  });

  describe('validation through the real pipe', () => {
    it.each([
      ['an unknown field', { tag: 'P', quantity: 1, total: 5 }],
      ['a blank tag', { tag: '   ', quantity: 1 }],
      ['a missing tag', { quantity: 1 }],
      ['a zero quantity', { tag: 'P', quantity: 0 }],
      ['a fractional panel quantity', { tag: 'P', quantity: 1.5 }],
      ['a huge panel quantity', { tag: 'P', quantity: 1000000 }],
    ])('rejects a panel with %s (400)', async (_label, body) => {
      const made = await start();

      await post(`/${made.id}/panels`, ENGINEER_A, body).expect(400);
      expect(fixture.panels.rows).toHaveLength(0);
    });

    it.each([
      ['a quantity of 0', { quantity: 0 }],
      ['four decimals of quantity', { quantity: 1.0001 }],
      ['a negative unit cost', { quantity: 1, unitCost: -1 }],
      ['three decimals of unit cost', { quantity: 1, unitCost: 1.005 }],
      ['a client-sent amount', { quantity: 1, amount: 99 }],
      ['a missing item', { quantity: 1, itemId: undefined }],
    ])('rejects a BOM line with %s (400)', async (_label, body) => {
      const made = await start();
      const panel = bodyOf(
        await post(`/${made.id}/panels`, ENGINEER_A, {
          tag: 'P',
          quantity: 1,
        }).expect(201),
      ).panels[0];

      await post(`/${made.id}/panels/${panel.id}/bom-lines`, ENGINEER_A, {
        itemId,
        ...body,
      }).expect(400);
      expect(fixture.bomLines.rows).toHaveLength(0);
    });

    it.each([
      ['an unknown category', { category: 'travel', amount: 1 }],
      ['a negative amount', { category: 'labor', amount: -5 }],
      ['a fractional amount', { category: 'labor', amount: 1000.5 }],
      ['a missing amount', { category: 'labor' }],
    ])('rejects a cost line with %s (400)', async (_label, body) => {
      const made = await start();
      const panel = bodyOf(
        await post(`/${made.id}/panels`, ENGINEER_A, {
          tag: 'P',
          quantity: 1,
        }).expect(201),
      ).panels[0];

      await post(
        `/${made.id}/panels/${panel.id}/cost-lines`,
        ENGINEER_A,
        body,
      ).expect(400);
      expect(fixture.costLines.rows).toHaveLength(0);
    });

    it('does not let a line change its item', async () => {
      const made = await start();
      const panel = bodyOf(
        await post(`/${made.id}/panels`, ENGINEER_A, {
          tag: 'P',
          quantity: 1,
        }).expect(201),
      ).panels[0];
      const withLine = bodyOf(
        await post(`/${made.id}/panels/${panel.id}/bom-lines`, ENGINEER_A, {
          itemId,
          quantity: 1,
        }).expect(201),
      );

      await patch(
        `/${made.id}/bom-lines/${withLine.panels[0].bomLines[0].id}`,
        ENGINEER_A,
        { itemId: itemId + 1 },
      ).expect(400);
    });

    it('rejects a start without a request id (400)', async () => {
      await post('', ENGINEER_A, {}).expect(400);
      await post('', ENGINEER_A, { requestId: 0 }).expect(400);
      await post('', ENGINEER_A, { requestId, status: 'submitted' }).expect(
        400,
      );
    });
  });
});
