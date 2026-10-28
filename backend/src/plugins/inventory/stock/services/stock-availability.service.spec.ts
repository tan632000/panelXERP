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

import {
  describeWithDatabase,
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { STOCK_AVAILABILITY_MAX_IDS } from '@plugins/inventory/stock/dto/stock-filter.dto';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import { StockAvailabilityService } from '@plugins/inventory/stock/services/stock-availability.service';
import { StockQueryService } from '@plugins/inventory/stock/services/stock-query.service';
import { StockController } from '@plugins/inventory/stock/stock.controller';

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

const ENGINEER = actor(21, 'engineer');
const SALES = actor(11, 'sales');
const DIRECTOR = actor(60, 'director');

type Row = Record<string, unknown>;

it('guards the availability read with stock:availability', () => {
  const method = Object.getOwnPropertyDescriptor(
    StockController.prototype,
    'findAvailability',
  )?.value as object;
  expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([
    'stock:availability',
  ]);
});

describeWithDatabase('StockAvailabilityService (real Postgres)', () => {
  let db: InventoryDb;
  let app: INestApplication<App>;
  let stocked: number;
  let empty: number;
  let deleted: number;

  beforeAll(async () => {
    db = await openInventoryDb();
    stocked = await db.createItem();
    empty = await db.createItem();
    deleted = await db.createItem();
    await db.post({
      documentType: 'spec',
      documentId: 1,
      lines: [
        {
          itemId: stocked,
          movementType: StockMovementType.RECEIPT,
          quantity: '7.5',
          unitCost: 1200,
        },
        {
          itemId: deleted,
          movementType: StockMovementType.RECEIPT,
          quantity: 1,
          unitCost: 900,
        },
      ],
    });
    await db.dataSource.query(
      `INSERT INTO stock_reservations (order_id, item_id, quantity) VALUES ($1, $2, 2.5)`,
      [2147480000, stocked],
    );
    await db.dataSource.query(
      `UPDATE stock_balances SET reserved = 2.5 WHERE item_id = $1`,
      [stocked],
    );
    await db.dataSource.query(
      `UPDATE items SET is_deleted = true WHERE id = $1`,
      [deleted],
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [StockController],
      providers: [
        StockQueryService,
        StockAvailabilityService,
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
    if (db) {
      await db.dataSource.query(
        `UPDATE items SET is_deleted = false WHERE id = $1`,
        [deleted],
      );
      await db.close();
    }
  });

  const availability = (token: string, itemIds: string) =>
    request(app.getHttpServer())
      .get('/inventory/stock/availability')
      .query({ itemIds })
      .set({ 'x-test-actor': token });

  it('answers quantities per item, zeros without a balance, and drops deleted or unknown ids', async () => {
    const res = await availability(
      ENGINEER,
      `${empty},${stocked},${deleted},2147483000,${stocked}`,
    ).expect(200);

    expect(res.body).toEqual(
      [
        { itemId: stocked, onHand: 7.5, reserved: 2.5, available: 5 },
        { itemId: empty, onHand: 0, reserved: 0, available: 0 },
      ].sort((a, b) => a.itemId - b.itemId),
    );
  });

  it.each([
    ['engineer', ENGINEER],
    ['sales', SALES],
    ['director', DIRECTOR],
  ])('serves %s no money key', async (_role, token) => {
    const res = await availability(token, String(stocked)).expect(200);
    expectNoMoneyKeys(res.body);
    expect(Object.keys((res.body as Row[])[0]).sort()).toEqual([
      'available',
      'itemId',
      'onHand',
      'reserved',
    ]);
  });

  it(`refuses more than ${STOCK_AVAILABILITY_MAX_IDS} ids and a missing or malformed list with 400`, async () => {
    const tooMany = Array.from(
      { length: STOCK_AVAILABILITY_MAX_IDS + 1 },
      (_, index) => index + 1,
    ).join(',');
    await availability(ENGINEER, tooMany).expect(400);

    const atLimit = Array.from(
      { length: STOCK_AVAILABILITY_MAX_IDS },
      (_, index) => index + 1,
    ).join(',');
    await availability(ENGINEER, atLimit).expect(200);

    await availability(ENGINEER, '').expect(400);
    await availability(ENGINEER, '1,abc').expect(400);
    await availability(ENGINEER, '1.5').expect(400);
    await request(app.getHttpServer())
      .get('/inventory/stock/availability')
      .set({ 'x-test-actor': ENGINEER })
      .expect(400);
  });

  it('still refuses the engineer the stock list itself', async () => {
    await request(app.getHttpServer())
      .get('/inventory/stock')
      .set({ 'x-test-actor': ENGINEER })
      .expect(403);
  });
});
