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

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { Item } from '@plugins/catalog/item/entities/item.entity';
import { ItemController } from '@plugins/catalog/item/item.controller';
import { ItemImportService } from '@plugins/catalog/item/services/item-import.service';
import { ItemService } from '@plugins/catalog/item/services/item.service';
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
  let inserted: unknown[];

  beforeEach(async () => {
    items = new FakeRepo<Item & FakeRow>({
      unique: [
        {
          constraint: 'uq_items_code_active',
          collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
        },
      ],
    });
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
        }) => Promise<void>,
      ) =>
        callback({
          insert: (_target, rows) => {
            inserted.push(...rows);
            return Promise.resolve();
          },
        }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ItemController],
      providers: [
        ItemService,
        ItemImportService,
        ReferenceCheckRegistry,
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
});
