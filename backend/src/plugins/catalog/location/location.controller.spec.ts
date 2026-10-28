import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

import { PERMISSIONS_KEY } from '@kernel/core/auth/decorators/auth.decorators';
import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';

import { Item } from '@plugins/catalog/item/entities/item.entity';
import { Location } from '@plugins/catalog/location/entities/location.entity';
import { LocationController } from '@plugins/catalog/location/location.controller';
import { LocationService } from '@plugins/catalog/location/services/location.service';
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

const STOREKEEPER = actor(41, 'storekeeper');
const PURCHASING = actor(40, 'purchasing');
const SALES = actor(11, 'sales');

const bodyOf = (res: request.Response) => res.body as { id: number };

describe('LocationController', () => {
  let app: INestApplication<App>;
  let locations: FakeRepo<Location & FakeRow>;
  let items: FakeRepo<Item & FakeRow>;

  beforeEach(async () => {
    locations = new FakeRepo<Location & FakeRow>({
      unique: [
        {
          constraint: 'uq_locations_code_active',
          collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
        },
      ],
    });
    items = new FakeRepo<Item & FakeRow>();
    locations.manager.transaction = ((work: (manager: unknown) => unknown) =>
      work({
        getRepository: (target: unknown) =>
          target === Item ? items : locations,
      })) as never;

    const moduleRef = await Test.createTestingModule({
      controllers: [LocationController],
      providers: [
        LocationService,
        { provide: getRepositoryToken(Location), useValue: locations },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
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
  const create = (token = STOREKEEPER, body: object = {}) =>
    request(app.getHttpServer())
      .post('/catalog/locations')
      .set(as(token))
      .send({ code: 'A-01-02', name: 'Shelf A1', ...body });

  it.each([
    ['findAll', 'location:read'],
    ['findOne', 'location:read'],
    ['create', 'location:create'],
    ['update', 'location:update'],
    ['remove', 'location:delete'],
  ])('guards %s with %s', (handler, permission) => {
    const method = Object.getOwnPropertyDescriptor(
      LocationController.prototype,
      handler,
    )?.value as object;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([permission]);
  });

  it('lets the storekeeper create (201) and purchasing read but not create', async () => {
    expect((await create()).status).toBe(201);

    const list = await request(app.getHttpServer())
      .get('/catalog/locations')
      .set(as(PURCHASING));
    expect(list.status).toBe(200);
    expect((await create(PURCHASING, { code: 'B-1' })).status).toBe(403);
  });

  it('keeps locations away from sales entirely', async () => {
    expect((await create(SALES)).status).toBe(403);
    const list = await request(app.getHttpServer())
      .get('/catalog/locations')
      .set(as(SALES));
    expect(list.status).toBe(403);
    expect(locations.rows).toHaveLength(0);
  });

  it('answers 409 to a duplicate code in any case and to deleting an item default location', async () => {
    const created = bodyOf(await create());
    expect((await create(STOREKEEPER, { code: 'a-01-02' })).status).toBe(409);

    items.seed({ defaultLocationId: created.id } as never);
    const blocked = await request(app.getHttpServer())
      .delete(`/catalog/locations/${created.id}`)
      .set(as(STOREKEEPER));
    expect(blocked.status).toBe(409);
    expect(locations.rows[0].isDeleted).toBe(false);
  });

  it('answers 400 to a blank name or a code over 32 characters', async () => {
    for (const override of [{ name: '  ' }, { code: 'X'.repeat(33) }]) {
      expect((await create(STOREKEEPER, override)).status).toBe(400);
    }
    expect(locations.rows).toHaveLength(0);
  });
});
