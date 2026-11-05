import { join } from 'path';

import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

import { PERMISSIONS_KEY } from '@kernel/core/auth/decorators/auth.decorators';
import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';
import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { Item } from '@plugins/catalog/item/entities/item.entity';
import { ItemController } from '@plugins/catalog/item/item.controller';
import { ItemImportService } from '@plugins/catalog/item/services/item-import.service';
import { ItemLabelService } from '@plugins/catalog/item/services/item-label.service';
import { ItemStockSettingsService } from '@plugins/catalog/item/services/item-stock-settings.service';
import { ItemService } from '@plugins/catalog/item/services/item.service';
import { Location } from '@plugins/catalog/location/entities/location.entity';
import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';

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

const PURCHASING = actor(40, 'purchasing');
const SALES = actor(11, 'sales');
const ENGINEER = actor(30, 'engineer');
const STOREKEEPER = actor(41, 'storekeeper');

interface ResponseBody {
  id: number;
  data: unknown[];
  deleted: number[];
  failed: unknown[];
  created: number;
  errors: Array<{ row: number }>;
}

const bodyOf = (res: request.Response): ResponseBody =>
  res.body as ResponseBody;

const NEW_ITEM = {
  code: 'LC1D09M7',
  name: 'Contactor 9A',
  group: 'contactor',
  unit: 'Cái',
};

describe('ItemController', () => {
  let app: INestApplication<App>;
  let registry: ReferenceCheckRegistry;
  let items: FakeRepo<Item & FakeRow>;
  let locations: FakeRepo<Location & FakeRow>;
  let inserted: unknown[];

  beforeEach(async () => {
    locations = new FakeRepo<Location & FakeRow>();
    items = new FakeRepo<Item & FakeRow>({
      unique: [
        {
          constraint: 'uq_items_code_active',
          collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
        },
        {
          constraint: 'uq_items_barcode_active',
          collides: (a, b) =>
            !!a.barcode && a.barcode.toLowerCase() === b.barcode?.toLowerCase(),
        },
      ],
    });
    // Writes read both tables through the transaction manager, one repo per entity.
    items.manager.transaction = ((work: (manager: unknown) => unknown) =>
      work({
        getRepository: (target: unknown) =>
          target === Location ? locations : items,
        query: items.query,
      })) as never;
    inserted = [];
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const dataSource = {
      transaction: (
        callback: (manager: {
          insert: (target: unknown, rows: unknown[]) => Promise<void>;
          query: () => Promise<unknown[]>;
        }) => Promise<void>,
      ) =>
        callback({
          insert: (_target, rows) => {
            inserted.push(...rows);
            return Promise.resolve();
          },
          query: () => Promise.resolve([]),
        }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ItemController],
      providers: [
        ItemService,
        ItemImportService,
        ItemStockSettingsService,
        ItemLabelService,
        ReferenceCheckRegistry,
        { provide: getRepositoryToken(Location), useValue: locations },
        {
          provide: getRepositoryToken(Item),
          useValue: Object.assign(items, {
            createQueryBuilder: () => query,
          }),
        },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    registry = moduleRef.get(ReferenceCheckRegistry);
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
  const create = (token = PURCHASING, body: object = NEW_ITEM) =>
    request(app.getHttpServer()).post('/items').set(as(token)).send(body);

  describe('permissions', () => {
    it.each([
      ['create', 'item:create'],
      ['update', 'item:update'],
      ['remove', 'item:delete'],
      ['findAll', 'item:read'],
      ['findOne', 'item:read'],
      ['import', 'item:import'],
      ['importTemplate', 'item:import'],
      ['updateStockSettings', 'item:stock_settings'],
      ['labelsPdf', 'item:read'],
    ])('guards %s with %s', (handler, permission) => {
      const method = Object.getOwnPropertyDescriptor(
        ItemController.prototype,
        handler,
      )?.value as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([
        permission,
      ]);
    });

    it('answers 403 to sales without item:create and creates nothing', async () => {
      const res = await create(SALES);

      expect(res.status).toBe(403);
      expect(items.rows).toHaveLength(0);
    });

    it('lets purchasing create (201) and an engineer read the list (200)', async () => {
      expect((await create()).status).toBe(201);

      const res = await request(app.getHttpServer())
        .get('/items')
        .set(as(ENGINEER));
      expect(res.status).toBe(200);
      expect(bodyOf(res).data).toHaveLength(1);
    });

    it('keeps import and its template away from sales and engineers', async () => {
      for (const token of [SALES, ENGINEER]) {
        const template = await request(app.getHttpServer())
          .get('/items/import-template')
          .set(as(token));
        expect(template.status).toBe(403);

        const upload = await request(app.getHttpServer())
          .post('/items/import')
          .set(as(token))
          .attach('file', join(__dirname, 'services/__fixtures__/BG.xlsx'));
        expect(upload.status).toBe(403);
      }
      expect(inserted).toHaveLength(0);
    });
  });

  describe('import', () => {
    it('answers 200 with the created count and the error rows for the sample sheet', async () => {
      const res = await request(app.getHttpServer())
        .post('/items/import')
        .set(as(PURCHASING))
        .attach(
          'file',
          join(__dirname, 'services/__fixtures__/items-import-sample.xlsx'),
        );

      expect(res.status).toBe(200);
      expect(bodyOf(res).created).toBe(3);
      expect(bodyOf(res).errors.map((error) => error.row)).toEqual([4, 6]);
      expect(inserted).toHaveLength(3);
    });

    it('answers 400 to a request without a file and to a non-xlsx upload', async () => {
      const none = await request(app.getHttpServer())
        .post('/items/import')
        .set(as(PURCHASING));
      expect(none.status).toBe(400);

      const csv = await request(app.getHttpServer())
        .post('/items/import')
        .set(as(PURCHASING))
        .attach('file', Buffer.from('a,b'), 'items.csv');
      expect(csv.status).toBe(400);
    });

    it('answers 400, not 413, to an upload over 5 MB', async () => {
      const res = await request(app.getHttpServer())
        .post('/items/import')
        .set(as(PURCHASING))
        .attach('file', Buffer.alloc(5 * 1024 * 1024 + 10), 'big.xlsx');
      expect(res.status).toBe(400);
    });

    it('serves the template as an xlsx attachment', async () => {
      const res = await request(app.getHttpServer())
        .get('/items/import-template')
        .set(as(PURCHASING));

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toContain('attachment');
    });
  });

  describe('conflicts', () => {
    it('answers 409 to a duplicate active code in any case, and 201 once that item is deleted', async () => {
      const first = await create();

      expect(
        (await create(PURCHASING, { ...NEW_ITEM, code: 'lc1d09m7' })).status,
      ).toBe(409);

      const deleted = await request(app.getHttpServer())
        .delete(`/items/${bodyOf(first).id}`)
        .set(as(PURCHASING));
      expect(deleted.status).toBe(200);

      expect((await create()).status).toBe(201);
    });

    it('answers 409 to delete, single and bulk, while a registered check reports a reference', async () => {
      const created = await create();
      registry.registerItemCheck('estimate', (id) =>
        Promise.resolve(id === bodyOf(created).id),
      );

      const single = await request(app.getHttpServer())
        .delete(`/items/${bodyOf(created).id}`)
        .set(as(PURCHASING));
      expect(single.status).toBe(409);

      const bulk = await request(app.getHttpServer())
        .post('/items/bulk-delete')
        .set(as(PURCHASING))
        .send({ ids: [bodyOf(created).id] });
      expect(bodyOf(bulk).deleted).toEqual([]);
      expect(bodyOf(bulk).failed).toHaveLength(1);
      expect(items.rows[0].isDeleted).toBe(false);
    });
  });

  describe('validation', () => {
    it('rejects a changed code on PATCH, accepts the echoed code, and leaves the item untouched', async () => {
      const created = await create();
      const url = `/items/${bodyOf(created).id}`;

      const changed = await request(app.getHttpServer())
        .patch(url)
        .set(as(PURCHASING))
        .send({ code: 'OTHER-1', name: 'Renamed' });
      expect(changed.status).toBe(400);
      expect(items.rows[0]).toMatchObject({
        code: 'LC1D09M7',
        name: 'Contactor 9A',
      });

      const echoed = await request(app.getHttpServer())
        .patch(url)
        .set(as(PURCHASING))
        .send({ code: 'LC1D09M7', name: 'Renamed' });
      expect(echoed.status).toBe(200);
      expect(items.rows[0].name).toBe('Renamed');
    });

    it('answers 400, not 500, to a null group or a null code on PATCH', async () => {
      const created = await create();
      const url = `/items/${bodyOf(created).id}`;

      for (const body of [{ group: null }, { code: null }, { unit: null }]) {
        const res = await request(app.getHttpServer())
          .patch(url)
          .set(as(PURCHASING))
          .send(body);
        expect(res.status).toBe(400);
      }
      expect(items.rows[0]).toMatchObject({
        code: 'LC1D09M7',
        group: 'contactor',
        unit: 'Cái',
      });
    });

    it('clears an optional field sent as null and refuses a null or blank name', async () => {
      const created = await create(PURCHASING, {
        ...NEW_ITEM,
        brand: 'Schneider',
        referencePrice: 450000,
      });
      const url = `/items/${bodyOf(created).id}`;

      const cleared = await request(app.getHttpServer())
        .patch(url)
        .set(as(PURCHASING))
        .send({ brand: null, referencePrice: null, note: null });
      expect(cleared.status).toBe(200);
      expect(items.rows[0].brand).toBeNull();
      expect(items.rows[0].referencePrice).toBeNull();

      for (const name of [null, '', '   ']) {
        const res = await request(app.getHttpServer())
          .patch(url)
          .set(as(PURCHASING))
          .send({ name });
        expect(res.status).toBe(400);
      }
      expect(items.rows[0].name).toBe('Contactor 9A');
    });

    it('answers 400 to a blank name, an unknown group, a negative price and a missing unit on create', async () => {
      for (const override of [
        { name: '   ' },
        { group: 'tools' },
        { referencePrice: -1 },
        { unit: '' },
        { code: '  ' },
      ]) {
        const res = await create(PURCHASING, { ...NEW_ITEM, ...override });
        expect(res.status).toBe(400);
      }
      expect(items.rows).toHaveLength(0);
    });
  });

  describe('stock settings, scan resolve and price visibility', () => {
    const settings = (token: string, id: number, body: object) =>
      request(app.getHttpServer())
        .patch(`/items/${id}/stock-settings`)
        .set(as(token))
        .send(body);
    const resolve = (token: string, code: string) =>
      request(app.getHttpServer())
        .get('/items/resolve')
        .query({ code })
        .set(as(token));
    const createPriced = (code: string, extra: object = {}) =>
      create(PURCHASING, {
        ...NEW_ITEM,
        code,
        referencePrice: 450000,
        ...extra,
      });

    it('hides every money key from the storekeeper on list, detail, resolve and stock settings', async () => {
      const created = bodyOf(await createPriced('LC1D09M7'));
      await settings(STOREKEEPER, created.id, { barcode: '8930001' });

      const list = await request(app.getHttpServer())
        .get('/items')
        .set(as(STOREKEEPER));
      const detail = await request(app.getHttpServer())
        .get(`/items/${created.id}`)
        .set(as(STOREKEEPER));
      const scanned = await resolve(STOREKEEPER, '8930001');
      const saved = await settings(STOREKEEPER, created.id, { minStock: 5 });

      for (const res of [list, detail, scanned, saved]) {
        expect(res.status).toBe(200);
        expectNoMoneyKeys(res.body);
      }
      expect(bodyOf(list).data).toHaveLength(1);
      // The row still holds the price: only the response drops it.
      expect(items.rows[0].referencePrice).toBe(450000);
    });

    it('shows the reference price to sales and purchasing, never to an engineer', async () => {
      const created = bodyOf(await createPriced('LC1D09M7'));

      const engineerDetail = await request(app.getHttpServer())
        .get(`/items/${created.id}`)
        .set(as(ENGINEER));
      const engineerList = await request(app.getHttpServer())
        .get('/items')
        .set(as(ENGINEER));
      expect(engineerDetail.status).toBe(200);
      expect(engineerDetail.body).not.toHaveProperty('referencePrice');
      expect(bodyOf(engineerList).data[0]).not.toHaveProperty('referencePrice');

      for (const token of [SALES, PURCHASING]) {
        const detail = await request(app.getHttpServer())
          .get(`/items/${created.id}`)
          .set(as(token));
        expect(detail.body).toMatchObject({ referencePrice: 450000 });

        const list = await request(app.getHttpServer())
          .get('/items')
          .set(as(token));
        expect(bodyOf(list).data[0]).toMatchObject({ referencePrice: 450000 });
      }
    });

    it('lets the storekeeper edit stock settings but not the item itself', async () => {
      const created = bodyOf(await createPriced('LC1D09M7'));

      const patch = await request(app.getHttpServer())
        .patch(`/items/${created.id}`)
        .set(as(STOREKEEPER))
        .send({ name: 'Renamed' });
      expect(patch.status).toBe(403);
      expect(items.rows[0].name).toBe('Contactor 9A');

      expect(
        (await settings(STOREKEEPER, created.id, { minStock: 2.5 })).status,
      ).toBe(200);
      expect(items.rows[0].minStock).toBe(2.5);
      expect((await settings(SALES, created.id, { minStock: 9 })).status).toBe(
        403,
      );
    });

    it('does not let item create or update carry the stock settings', async () => {
      const created = bodyOf(await createPriced('LC1D09M7'));

      expect((await createPriced('X-1', { barcode: 'B-1' })).status).toBe(400);
      const patch = await request(app.getHttpServer())
        .patch(`/items/${created.id}`)
        .set(as(PURCHASING))
        .send({ minStock: 3 });
      expect(patch.status).toBe(400);
    });

    it('answers 409 to a barcode already used as a barcode or as another item code', async () => {
      const first = bodyOf(await createPriced('LC1D09M7'));
      const second = bodyOf(await createPriced('LC1D12M7'));
      await settings(PURCHASING, first.id, { barcode: 'ABC-1' });

      expect(
        (await settings(PURCHASING, second.id, { barcode: 'abc-1' })).status,
      ).toBe(409);
      expect(
        (await settings(PURCHASING, second.id, { barcode: 'lc1d09m7' })).status,
      ).toBe(409);
      expect(items.rows[1].barcode ?? null).toBeNull();
    });

    it('answers 409 to a new item whose code is another item barcode', async () => {
      const first = bodyOf(await createPriced('LC1D09M7'));
      await settings(PURCHASING, first.id, { barcode: '8930001' });

      expect((await createPriced('8930001')).status).toBe(409);
      expect(items.rows).toHaveLength(1);
    });

    it('resolves by barcode, by code in any case, and answers 404 to an unknown value', async () => {
      const first = bodyOf(await createPriced('LC1D09M7'));
      await settings(PURCHASING, first.id, { barcode: '8930001' });

      const byBarcode = await resolve(STOREKEEPER, '  8930001 ');
      expect(byBarcode.status).toBe(200);
      expect(byBarcode.body).toEqual({
        id: first.id,
        code: 'LC1D09M7',
        name: 'Contactor 9A',
        unit: 'Cái',
        brand: null,
        barcode: '8930001',
        defaultLocationCode: null,
      });

      const byCode = await resolve(STOREKEEPER, 'lc1d09m7');
      expect(byCode.status).toBe(200);
      expect(byCode.body).toMatchObject({ id: first.id });

      const unknown = await resolve(STOREKEEPER, 'NOPE');
      expect(unknown.status).toBe(404);
      expect(unknown.body).toMatchObject({ message: 'No item for NOPE' });

      expect((await resolve(STOREKEEPER, '   ')).status).toBe(400);
    });

    it('stops resolving the barcode of a deleted item', async () => {
      const first = bodyOf(await createPriced('LC1D09M7'));
      await settings(PURCHASING, first.id, { barcode: '8930001' });
      await request(app.getHttpServer())
        .delete(`/items/${first.id}`)
        .set(as(PURCHASING));

      expect((await resolve(STOREKEEPER, '8930001')).status).toBe(404);
      expect((await resolve(STOREKEEPER, 'LC1D09M7')).status).toBe(404);
    });

    it('names the default location code on resolve and refuses an unknown or inactive location', async () => {
      const first = bodyOf(await createPriced('LC1D09M7'));
      const shelf = locations.seed({
        code: 'A-01-02',
        name: 'Shelf',
        isActive: true,
      } as never);
      const closed = locations.seed({
        code: 'Z-9',
        name: 'Closed',
        isActive: false,
      } as never);

      for (const defaultLocationId of [999, closed.id]) {
        expect(
          (await settings(STOREKEEPER, first.id, { defaultLocationId })).status,
        ).toBe(400);
      }
      expect(
        (await settings(STOREKEEPER, first.id, { defaultLocationId: shelf.id }))
          .status,
      ).toBe(200);

      const scanned = await resolve(STOREKEEPER, 'LC1D09M7');
      expect(scanned.body).toMatchObject({ defaultLocationCode: 'A-01-02' });

      const list = await request(app.getHttpServer())
        .get('/items')
        .set(as(STOREKEEPER));
      expect(bodyOf(list).data[0]).toMatchObject({
        defaultLocationId: shelf.id,
        defaultLocation: { id: shelf.id, code: 'A-01-02', name: 'Shelf' },
      });
    });

    it('clears the settings sent as null and refuses a negative minimum', async () => {
      const first = bodyOf(await createPriced('LC1D09M7'));
      await settings(STOREKEEPER, first.id, { barcode: 'B-1', minStock: 4 });

      const cleared = await settings(STOREKEEPER, first.id, {
        barcode: null,
        minStock: null,
      });
      expect(cleared.status).toBe(200);
      expect(items.rows[0].barcode).toBeNull();
      expect(items.rows[0].minStock).toBeNull();

      expect(
        (await settings(STOREKEEPER, first.id, { minStock: -1 })).status,
      ).toBe(400);
    });
  });

  describe('labels.pdf', () => {
    const labels = (token: string, query: object) =>
      request(app.getHttpServer())
        .get('/items/labels.pdf')
        .query(query)
        .set(as(token))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });
    const seedItem = async (code: string) =>
      bodyOf(
        await create(PURCHASING, {
          ...NEW_ITEM,
          code,
          referencePrice: 450000,
        }),
      ).id;

    it('serves the PDF to a storekeeper from /items/labels.pdf, not as an item id', async () => {
      const id = await seedItem('A-01');

      const res = await labels(STOREKEEPER, { ids: String(id), copies: 2 });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('item-labels.pdf');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('defaults copies to 1 and answers 404 to an unknown id', async () => {
      const id = await seedItem('A-01');

      expect((await labels(STOREKEEPER, { ids: String(id) })).status).toBe(200);
      expect((await labels(STOREKEEPER, { ids: `${id},999` })).status).toBe(
        404,
      );
    });

    it.each([
      ['no ids', {}],
      ['an empty ids', { ids: '' }],
      ['a non-numeric id', { ids: '1,x' }],
      ['copies of 0', { ids: '1', copies: 0 }],
      ['copies that are not a number', { ids: '1', copies: 'x' }],
      ['more than 500 labels', { ids: '1,2,3', copies: 167 }],
      ['an id above the integer range', { ids: '99999999999' }],
      ['a hex id', { ids: '0x10' }],
      ['an exponent id', { ids: '1e2' }],
      ['hex copies', { ids: '1', copies: '0x2' }],
    ])('answers 400 to %s', async (_label, query) => {
      expect((await labels(STOREKEEPER, query)).status).toBe(400);
    });

    it('answers 422 for an item code Code 128 cannot print', async () => {
      const id = await seedItem('Bộ-01');

      expect((await labels(STOREKEEPER, { ids: String(id) })).status).toBe(422);
    });
  });
});
