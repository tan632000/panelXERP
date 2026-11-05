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
import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import {
  buildEstimateFixture,
  type EstimateFixture,
} from '@plugins/sales/estimate/estimate-fixture.helper-spec';
import { EstimateController } from '@plugins/sales/estimate/estimate.controller';
import { EstimateEditService } from '@plugins/sales/estimate/services/estimate-edit.service';
import { EstimatePricingService } from '@plugins/sales/estimate/services/estimate-pricing.service';
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
  bomLines: Array<{
    id: number;
    amount: number;
    unitCost: number;
    itemCode: string;
  }>;
  costLines: Array<{ id: number; amount: number }>;
}
interface Body {
  id: number;
  code: string;
  status: string;
  total: number;
  message: string | string[];
  data: Array<{ id: number; total?: number }>;
  revisions: Array<{ total?: number }>;
  panels: PanelBody[];
  current: {
    panels: PanelBody[];
    status: string;
    revision: number;
    total?: number;
  };
  latestRevision: number;
}
const bodyOf = (res: request.Response): Body => res.body as Body;

/** The panels a response carries: a revision view holds them at the top, a detail under `current`. */
const panelsOf = (body: Body): PanelBody[] =>
  body.panels ?? body.current?.panels ?? [];

/** An estimate body served to an actor without the price scope: no money key, no cost lines. */
function expectPriceFree(body: Body): void {
  expectNoMoneyKeys(body);
  // `costLines` is no money key by name, yet every entry of it is a price.
  for (const panel of panelsOf(body)) {
    expect('costLines' in panel).toBe(false);
  }
}

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
        { provide: EstimatePricingService, useValue: fixture.pricing },
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

  /** A submitted estimate with one panel and one BOM line, entered and handed in by engineer A. */
  const submitted = async () => {
    const made = await start();
    const panelId = bodyOf(
      await post(`/${made.id}/panels`, ENGINEER_A, {
        tag: 'P',
        quantity: 2,
      }).expect(201),
    ).panels[0].id;
    const lineId = bodyOf(
      await post(`/${made.id}/panels/${panelId}/bom-lines`, ENGINEER_A, {
        itemId,
        quantity: 3,
      }).expect(201),
    ).panels[0].bomLines[0].id;
    await post(`/${made.id}/submit`, ENGINEER_A).expect(200);
    return { id: made.id, panelId, lineId };
  };

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
      ['setUnitCost', 'estimate:price'],
      ['completePricing', 'estimate:price'],
      ['addCostLine', 'estimate:price'],
      ['updateCostLine', 'estimate:price'],
      ['deleteCostLine', 'estimate:price'],
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

    it('answers 403 to engineer A and the engineering lead on every pricing route, and 200 to the sales owner', async () => {
      const { id, panelId, lineId } = await submitted();
      const cost = { category: 'labor', amount: 100 };

      for (const token of [ENGINEER_A, LEAD]) {
        await patch(`/${id}/bom-lines/${lineId}/unit-cost`, token, {
          unitCost: 5,
        }).expect(403);
        await post(`/${id}/price`, token).expect(403);
        await post(`/${id}/panels/${panelId}/cost-lines`, token, cost).expect(
          403,
        );
        await patch(`/${id}/cost-lines/1`, token, { amount: 1 }).expect(403);
        await del(`/${id}/cost-lines/1`, token).expect(403);
      }
      expect(fixture.costLines.rows).toHaveLength(0);
      expect(fixture.bomLines.rows[0].unitCost).toBe(1000);

      await patch(`/${id}/bom-lines/${lineId}/unit-cost`, SALES_A, {
        unitCost: 5,
      }).expect(200);
      const added = bodyOf(
        await post(`/${id}/panels/${panelId}/cost-lines`, SALES_A, cost).expect(
          201,
        ),
      );
      const costId = added.panels[0].costLines[0].id;
      await patch(`/${id}/cost-lines/${costId}`, SALES_A, {
        amount: 200,
      }).expect(200);
      await del(`/${id}/cost-lines/${costId}`, SALES_A).expect(200);
      await post(`/${id}/price`, SALES_A).expect(200);
    });

    it('answers 404 to a sales user who does not own the request on the pricing routes', async () => {
      const { id, panelId, lineId } = await submitted();

      await patch(`/${id}/bom-lines/${lineId}/unit-cost`, SALES_B, {
        unitCost: 5,
      }).expect(404);
      await post(`/${id}/panels/${panelId}/cost-lines`, SALES_B, {
        category: 'labor',
        amount: 1,
      }).expect(404);
      await post(`/${id}/price`, SALES_B).expect(404);
      expect(fixture.bomLines.rows[0].unitCost).toBe(1000);
    });

    it('answers 404 to the administrator on a BOM line edit, and 200 to the director and the engineering lead', async () => {
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

      await patch(`/${made.id}/bom-lines/${lineId}`, DIRECTOR, {
        quantity: 2,
      }).expect(200);
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
    it('builds, submits, is priced by sales, refuses edits, and revises', async () => {
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
      // 12.5 × 1,000 × 2 panels, as the sales owner reads them: no cost line yet
      expect(
        bodyOf(await get(`/${made.id}`, SALES_A).expect(200)),
      ).toMatchObject({
        total: 25000,
        current: { panels: [{ unitCost: 12500, total: 25000 }] },
      });
      const lineId = bodyOf(await get(`/${made.id}`, SALES_A).expect(200))
        .current.panels[0].bomLines[0].id;
      // A draft takes no price: sales prices the submitted revision.
      await patch(`/${made.id}/bom-lines/${lineId}/unit-cost`, SALES_A, {
        unitCost: 2000,
      }).expect(409);
      await post(`/${made.id}/price`, SALES_A).expect(409);

      const submitted = await post(`/${made.id}/submit`, ENGINEER_A).expect(
        200,
      );
      expect(bodyOf(submitted)).toMatchObject({ status: 'submitted' });
      expect(fixture.requests.rows[0].status).toBe(RequestStatus.ESTIMATED);
      expect(fixture.notifications.emit).toHaveBeenCalledTimes(1);

      await patch(`/${made.id}/bom-lines/${lineId}/unit-cost`, SALES_A, {
        unitCost: 2000,
      }).expect(200);
      await post(`/${made.id}/panels/${panelId}/cost-lines`, SALES_A, {
        category: 'labor',
        amount: 1200000,
      }).expect(201);
      // (12.5 × 2,000 + 1,200,000) × 2 panels
      expect(
        bodyOf(await get(`/${made.id}`, SALES_A).expect(200)),
      ).toMatchObject({
        total: 2450000,
        current: {
          pricedAt: null,
          panels: [{ unitCost: 1225000, total: 2450000 }],
        },
      });
      const priced = bodyOf(
        await post(`/${made.id}/price`, SALES_A).expect(200),
      );
      expect(priced).toMatchObject({
        status: 'submitted',
        pricedAt: expect.any(String) as string,
      });
      // A priced revision is frozen for sales too.
      await patch(`/${made.id}/bom-lines/${lineId}/unit-cost`, SALES_A, {
        unitCost: 1,
      }).expect(409);
      await post(`/${made.id}/price`, SALES_A).expect(409);

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

  describe('money visibility', () => {
    /**
     * Runs every estimate route open to one actor. Sales prices the submitted revision in the
     * middle, so the revision the actor then revises already carries unit costs and cost lines.
     */
    async function flowAs(token: string): Promise<Body[]> {
      const bodies: Body[] = [];
      const seen = (res: request.Response) => {
        const body = bodyOf(res);
        bodies.push(body);
        return body;
      };

      const id = seen(await post('', token, { requestId }).expect(201)).id;
      const panelId = seen(
        await post(`/${id}/panels`, token, { tag: 'P1', quantity: 2 }).expect(
          201,
        ),
      ).panels[0].id;
      const lineId = seen(
        await post(`/${id}/panels/${panelId}/bom-lines`, token, {
          itemId,
          quantity: 2,
        }).expect(201),
      ).panels[0].bomLines[0].id;

      const secondId = seen(
        await post(`/${id}/panels`, token, { tag: 'P2', quantity: 1 }).expect(
          201,
        ),
      ).panels[1].id;
      const secondLine = seen(
        await post(`/${id}/panels/${secondId}/bom-lines`, token, {
          itemId,
          quantity: 1,
        }).expect(201),
      ).panels[1].bomLines[0].id;
      seen(await del(`/${id}/bom-lines/${secondLine}`, token).expect(200));
      seen(await del(`/${id}/panels/${secondId}`, token).expect(200));

      seen(
        await patch(`/${id}/panels/${panelId}`, token, {
          description: 'Main',
        }).expect(200),
      );
      seen(
        await patch(`/${id}/bom-lines/${lineId}`, token, {
          quantity: 3,
        }).expect(200),
      );

      // An empty page would pass the no-money check without proving anything.
      expect(
        seen(await get('', token).expect(200)).data.length,
      ).toBeGreaterThan(0);
      seen(await get(`/${id}`, token).expect(200));
      seen(await post(`/${id}/submit`, token).expect(200));

      await patch(`/${id}/bom-lines/${lineId}/unit-cost`, SALES_A, {
        unitCost: 1000,
      }).expect(200);
      await post(`/${id}/panels/${panelId}/cost-lines`, SALES_A, {
        category: 'labor',
        amount: 500000,
      }).expect(201);
      await post(`/${id}/price`, SALES_A).expect(200);

      seen(await post(`/${id}/revise`, token).expect(200));
      seen(await get(`/${id}`, token).expect(200));
      seen(await get(`/${id}?revision=1`, token).expect(200));
      return bodies;
    }

    it.each([
      ['an engineer', ENGINEER_A],
      ['the engineering lead', LEAD],
    ])(
      'sends %s no money key and no cost line on any route',
      async (_label, token) => {
        const bodies = await flowAs(token);

        // create, 2 adds, a second panel and line added then deleted, 2 updates,
        // list, detail, submit, revise, then two details
        expect(bodies).toHaveLength(15);
        for (const body of bodies) expectPriceFree(body);
      },
    );

    it('keeps the figures for sales, the sales manager and the director', async () => {
      const id = (await flowAs(ENGINEER_A))[0].id;

      for (const token of [SALES_A, MANAGER, DIRECTOR]) {
        for (const path of [`/${id}`, `/${id}?revision=1`]) {
          const body = bodyOf(await get(path, token).expect(200));
          const panel = body.current.panels[0];
          expect(panel.costLines[0].amount).toBeGreaterThan(0);
          expect(panel.bomLines[0].unitCost).toBeGreaterThan(0);
          expect(body.total).toBeGreaterThan(0);
          expect(body.current.total).toBeGreaterThan(0);
          expect(body.revisions[0].total).toBeGreaterThan(0);
        }
        const list = bodyOf(await get('', token).expect(200));
        expect(list.data[0].total).toBeGreaterThan(0);
      }
    });

    it('keeps the figures in the body of a draft edit by the director', async () => {
      const made = await start();
      const panelId = bodyOf(
        await post(`/${made.id}/panels`, DIRECTOR, {
          tag: 'P',
          quantity: 1,
        }).expect(201),
      ).panels[0].id;

      const edited = bodyOf(
        await post(`/${made.id}/panels/${panelId}/bom-lines`, DIRECTOR, {
          itemId,
          quantity: 2,
        }).expect(201),
      );

      expect(edited.total).toBeGreaterThan(0);
      expect(edited.panels[0].total).toBeGreaterThan(0);
      expect(edited.panels[0].bomLines[0].unitCost).toBeGreaterThan(0);
      expect(edited.panels[0].costLines).toEqual([]);
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
      const { id, panelId } = await submitted();

      await post(`/${id}/panels/${panelId}/cost-lines`, SALES_A, body).expect(
        400,
      );
      expect(fixture.costLines.rows).toHaveLength(0);
    });

    it.each([
      ['a negative unit cost', { unitCost: -1 }],
      ['three decimals', { unitCost: 1.005 }],
      ['a unit cost beyond the cap', { unitCost: 10000000001 }],
      ['a missing unit cost', {}],
      ['a client-sent amount', { unitCost: 5, amount: 99 }],
    ])('rejects a unit cost with %s (400)', async (_label, body) => {
      const { id, lineId } = await submitted();

      await patch(`/${id}/bom-lines/${lineId}/unit-cost`, SALES_A, body).expect(
        400,
      );
      expect(fixture.bomLines.rows[0].unitCost).toBe(1000);
    });

    it('rejects a unit cost on a draft BOM line (400) and prices the line at the reference price without it', async () => {
      const made = await start();
      const panel = bodyOf(
        await post(`/${made.id}/panels`, ENGINEER_A, {
          tag: 'P',
          quantity: 1,
        }).expect(201),
      ).panels[0];
      const path = `/${made.id}/panels/${panel.id}/bom-lines`;

      await post(path, DIRECTOR, { itemId, quantity: 1, unitCost: 5 }).expect(
        400,
      );
      await post(path, ENGINEER_A, { itemId, quantity: 1, unitCost: 5 }).expect(
        400,
      );
      expect(fixture.bomLines.rows).toHaveLength(0);

      const added = bodyOf(
        await post(path, DIRECTOR, { itemId, quantity: 1 }).expect(201),
      );
      expect(added.panels[0].bomLines[0].unitCost).toBe(1000);
      await patch(
        `/${made.id}/bom-lines/${added.panels[0].bomLines[0].id}`,
        DIRECTOR,
        { unitCost: 5 },
      ).expect(400);
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
