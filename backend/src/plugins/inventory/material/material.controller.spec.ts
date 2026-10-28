import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { PERMISSIONS_KEY } from '@kernel/core/auth/decorators/auth.decorators';
import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';
import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import { DataScopeService } from '@shared/services/data-scope.service';

import {
  describeWithDatabase,
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import {
  openMaterialWorld,
  type MaterialWorld,
} from '@plugins/inventory/material/material-db.helper-spec';
import { MaterialController } from '@plugins/inventory/material/material.controller';
import { MaterialService } from '@plugins/inventory/material/services/material.service';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

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

/**
 * Sales money the material view must never carry, beyond the shared money keys: any discount,
 * VAT or margin field, whatever its exact name.
 */
const SALES_MONEY =
  /^(unitPrice|amount|subtotal|total|avgCost|value|discount.*|vat.*|margin.*)$/i;

/** Every key path naming sales money; a page envelope's counters are not money. */
function salesMoneyKeys(json: unknown, path = '$'): string[] {
  if (Array.isArray(json)) {
    return json.flatMap((entry, index) =>
      salesMoneyKeys(entry, `${path}[${index}]`),
    );
  }
  if (json === null || typeof json !== 'object') return [];
  return Object.entries(json as Record<string, unknown>).flatMap(
    ([key, value]) => {
      if (path === '$' && key === 'meta') return [];
      const here = `${path}.${key}`;
      return [
        ...(SALES_MONEY.test(key) ? [here] : []),
        ...salesMoneyKeys(value, here),
      ];
    },
  );
}

it('guards both reads with material:read', () => {
  for (const handler of ['findOrders', 'findOrder']) {
    const method = Object.getOwnPropertyDescriptor(
      MaterialController.prototype,
      handler,
    )?.value as object;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([
      'material:read',
    ]);
  }
});

describeWithDatabase('MaterialController (real Postgres)', () => {
  let db: InventoryDb;
  let world: MaterialWorld;
  let app: INestApplication<App>;

  const actor = (userId: number, role: string) => {
    const permissions = seededRolePermissions(role);
    if (!permissions) throw new Error(`Role ${role} is not seeded`);
    return JSON.stringify({ userId, role, permissions });
  };
  let SALES_A: string;
  let SALES_B: string;
  const PURCHASING = actor(50, 'purchasing');
  const STOREKEEPER = actor(40, 'storekeeper');
  const DIRECTOR = actor(60, 'director');
  const ENGINEER = actor(21, 'engineer');

  beforeAll(async () => {
    db = await openInventoryDb();
    world = await openMaterialWorld(db);
    SALES_A = actor(world.salesA, 'sales');
    SALES_B = actor(world.salesB, 'sales');

    const moduleRef = await Test.createTestingModule({
      controllers: [MaterialController],
      providers: [
        MaterialService,
        OrderMaterialReadPort,
        DataScopeService,
        { provide: DataSource, useValue: db.dataSource },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await world?.cleanup();
    await db?.close();
  });

  const list = (token: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .get('/inventory/materials/orders')
      .query({ search: world.tag, ...query })
      .set({ 'x-test-actor': token });
  const detail = (token: string, orderId: number) =>
    request(app.getHttpServer())
      .get(`/inventory/materials/orders/${orderId}`)
      .set({ 'x-test-actor': token });
  const ids = (body: unknown) =>
    (body as { data: Array<{ id: number }> }).data.map((row) => row.id).sort();

  it.each([
    ['purchasing', () => PURCHASING],
    ['storekeeper', () => STOREKEEPER],
    ['director', () => DIRECTOR],
  ])('lets %s read every order', async (_role, token) => {
    const res = await list(token()).expect(200);
    expect(ids(res.body)).toEqual(
      [world.ownOrder, world.otherOrder, world.deliveredOrder].sort(),
    );
    await detail(token(), world.otherOrder).expect(200);
  });

  it('keeps another owner’s orders out of a sales list, filter or not', async () => {
    expect(ids((await list(SALES_B).expect(200)).body)).toEqual([
      world.otherOrder,
    ]);
    const widened = await list(SALES_B, {
      salesOwnerId: String(world.salesA),
    }).expect(200);
    expect(ids(widened.body)).toEqual([]);
  });

  it('answers 404 to a sales account reading another owner’s order', async () => {
    await detail(SALES_B, world.ownOrder).expect(404);
    await detail(SALES_A, world.ownOrder).expect(200);
  });

  it('refuses an engineer with 403', async () => {
    await list(ENGINEER).expect(403);
    await detail(ENGINEER, world.ownOrder).expect(403);
  });

  it.each([
    ['storekeeper', () => STOREKEEPER],
    ['purchasing', () => PURCHASING],
    ['director', () => DIRECTOR],
    ['sales', () => SALES_A],
  ])(
    'serves %s no sales money on the list and the detail',
    async (_role, token) => {
      const page = (await list(token()).expect(200)).body as unknown;
      const one = (await detail(token(), world.ownOrder).expect(200))
        .body as unknown;

      for (const body of [page, one]) {
        expectNoMoneyKeys(body);
        expect(salesMoneyKeys(body)).toEqual([]);
      }
      expect(one).toMatchObject({
        order: { id: world.ownOrder },
        items: expect.arrayContaining([
          expect.objectContaining({ itemId: world.itemA, demand: 6 }),
        ]) as unknown,
      });
    },
  );
});
