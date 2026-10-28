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
import {
  expectNoMoneyKeys,
  findMoneyKeys,
} from '@kernel/shared/testing/money-keys.helper-spec';

import {
  describeWithDatabase,
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
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

const STOREKEEPER = actor(40, 'storekeeper');
const PURCHASING = actor(50, 'purchasing');
const DIRECTOR = actor(60, 'director');
const SALES = actor(11, 'sales');
const ENGINEER = actor(21, 'engineer');

interface Page<T> {
  data: T[];
  meta: { total: number };
}
type Row = Record<string, unknown>;

describe('StockController permissions', () => {
  it.each([
    ['findAll', 'stock:read'],
    ['findMovements', 'stock:ledger'],
  ])('guards %s with %s', (handler, permission) => {
    const method = Object.getOwnPropertyDescriptor(
      StockController.prototype,
      handler,
    )?.value as object;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([permission]);
  });
});

describeWithDatabase('StockController (real Postgres)', () => {
  let db: InventoryDb;
  let app: INestApplication<App>;
  let itemId: number;
  let lowItemId: number;
  let locationId: number;

  beforeAll(async () => {
    db = await openInventoryDb();
    const [location]: Array<{ id: number }> = await db.dataSource.query(
      `INSERT INTO locations (code, name) VALUES ($1, 'Stock spec shelf') RETURNING id`,
      [`${db.tag}-L`],
    );
    locationId = location.id;

    itemId = await db.createItem({ minStock: 1 });
    lowItemId = await db.createItem({ minStock: 10 });
    await db.dataSource.query(
      `UPDATE items SET default_location_id = $2 WHERE id = $1`,
      [itemId, locationId],
    );
    await db.post({
      documentType: 'spec',
      documentId: 1,
      lines: [
        {
          itemId,
          movementType: StockMovementType.RECEIPT,
          quantity: 4,
          unitCost: 1500,
        },
        {
          itemId: lowItemId,
          movementType: StockMovementType.RECEIPT,
          quantity: 2,
          unitCost: 700,
        },
        { itemId, movementType: StockMovementType.ISSUE, quantity: -1 },
      ],
    });

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
        `UPDATE items SET default_location_id = NULL WHERE id = $1`,
        [itemId],
      );
      await db.dataSource.query(`DELETE FROM locations WHERE id = $1`, [
        locationId,
      ]);
      await db.close();
    }
  });

  const as = (token: string) => ({ 'x-test-actor': token });
  const list = (token: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .get('/inventory/stock')
      .query({ search: db.tag, ...query })
      .set(as(token));
  const movements = (token: string, id = itemId) =>
    request(app.getHttpServer())
      .get(`/inventory/stock/${id}/movements`)
      .set(as(token));

  it('lists the stock of every matching item with quantities', async () => {
    const res = await list(STOREKEEPER).expect(200);
    const body = res.body as Page<Row>;
    expect(body.meta.total).toBe(2);
    expect(body.data[0]).toMatchObject({
      itemId,
      defaultLocationId: locationId,
      locationCode: `${db.tag}-L`,
      onHand: 3,
      reserved: 0,
      available: 3,
      minStock: 1,
      low: false,
    });
    expect(body.data[1]).toMatchObject({ itemId: lowItemId, low: true });
  });

  it('filters by low stock and by default location', async () => {
    const low = (await list(STOREKEEPER, { lowOnly: 'true' }).expect(200))
      .body as Page<Row>;
    expect(low.data.map((row) => row.itemId)).toEqual([lowItemId]);

    const shelf = (
      await list(STOREKEEPER, { locationId: String(locationId) }).expect(200)
    ).body as Page<Row>;
    expect(shelf.data.map((row) => row.itemId)).toEqual([itemId]);
  });

  it('hides every money key from the storekeeper on the list and the ledger', async () => {
    expectNoMoneyKeys((await list(STOREKEEPER).expect(200)).body);
    const ledger = await movements(STOREKEEPER).expect(200);
    expectNoMoneyKeys(ledger.body);
    expect((ledger.body as Page<Row>).data[0]).not.toHaveProperty(
      'avgCostAfter',
    );
  });

  it('shows costs to purchasing and the director', async () => {
    for (const token of [PURCHASING, DIRECTOR]) {
      const stock = (await list(token).expect(200)).body as Page<Row>;
      expect(stock.data[0]).toMatchObject({ avgCost: 1500, value: 4500 });
      expect(findMoneyKeys(stock)).toEqual(
        expect.arrayContaining(['$.data[0].avgCost', '$.data[0].value']),
      );

      const ledger = (await movements(token).expect(200)).body as Page<Row>;
      // Newest first: the issue, then the receipt.
      expect(ledger.data.map((row) => row.movementType)).toEqual([
        'issue',
        'receipt',
      ]);
      expect(ledger.data[0]).toMatchObject({
        quantity: -1,
        unitCost: 1500,
        value: -1500,
        onHandAfter: 3,
        avgCostAfter: 1500,
      });
    }
  });

  it.each([
    ['sales', SALES],
    ['engineer', ENGINEER],
  ])('refuses %s on both reads with 403', async (_role, token) => {
    await list(token).expect(403);
    await movements(token).expect(403);
  });

  it('answers 404 for the ledger of an unknown item', async () => {
    await movements(STOREKEEPER, 2147483000).expect(404);
  });
});
