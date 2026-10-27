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

import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
import { SupplierReferenceCheckRegistry } from '@plugins/inventory/_shared/gateways/supplier-reference-check-registry';
import { Supplier } from '@plugins/inventory/supplier/entities/supplier.entity';
import { SupplierService } from '@plugins/inventory/supplier/services/supplier.service';
import { SupplierController } from '@plugins/inventory/supplier/supplier.controller';

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

const PURCHASING = actor(50, 'purchasing');
const DIRECTOR = actor(60, 'director');
const STOREKEEPER = actor(40, 'storekeeper');
const SALES = actor(11, 'sales');

interface ResponseBody {
  id: number;
  data: unknown[];
  deleted: number[];
  failed: unknown[];
}

const bodyOf = (res: request.Response): ResponseBody =>
  res.body as ResponseBody;

const NEW_SUPPLIER = { code: 'NCC_0001', name: 'Thep Viet' };

describe('SupplierController', () => {
  let app: INestApplication<App>;
  let registry: SupplierReferenceCheckRegistry;
  let suppliers: FakeRepo<Supplier & FakeRow>;

  beforeEach(async () => {
    suppliers = new FakeRepo<Supplier & FakeRow>({
      unique: [
        {
          constraint: 'uq_suppliers_code_active',
          collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
        },
      ],
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [SupplierController],
      providers: [
        SupplierService,
        SupplierReferenceCheckRegistry,
        { provide: getRepositoryToken(Supplier), useValue: suppliers },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    registry = moduleRef.get(SupplierReferenceCheckRegistry);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const as = (token: string) => ({ 'x-test-actor': token });

  describe('permissions', () => {
    it.each([
      ['create', 'supplier:create'],
      ['update', 'supplier:update'],
      ['remove', 'supplier:delete'],
      ['findAll', 'supplier:read'],
      ['findOne', 'supplier:read'],
    ])('guards %s with %s', (handler, permission) => {
      const method = Object.getOwnPropertyDescriptor(
        SupplierController.prototype,
        handler,
      )?.value as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([
        permission,
      ]);
    });

    it('answers 403 to a storekeeper creating a supplier and creates nothing', async () => {
      const res = await request(app.getHttpServer())
        .post('/inventory/suppliers')
        .set(as(STOREKEEPER))
        .send(NEW_SUPPLIER);

      expect(res.status).toBe(403);
      expect(suppliers.rows).toHaveLength(0);
    });

    it('answers 403 to a sales actor reading the suppliers', async () => {
      const list = await request(app.getHttpServer())
        .get('/inventory/suppliers')
        .set(as(SALES));
      expect(list.status).toBe(403);
    });

    it('lets purchasing create and a storekeeper read, but not update or delete', async () => {
      const created = await request(app.getHttpServer())
        .post('/inventory/suppliers')
        .set(as(PURCHASING))
        .send(NEW_SUPPLIER);
      expect(created.status).toBe(201);
      const url = `/inventory/suppliers/${bodyOf(created).id}`;

      const read = await request(app.getHttpServer())
        .get(url)
        .set(as(STOREKEEPER));
      expect(read.status).toBe(200);

      const list = await request(app.getHttpServer())
        .get('/inventory/suppliers')
        .set(as(STOREKEEPER));
      expect(list.status).toBe(200);
      expect(bodyOf(list).data).toHaveLength(1);

      const patch = await request(app.getHttpServer())
        .patch(url)
        .set(as(STOREKEEPER))
        .send({ name: 'Renamed' });
      expect(patch.status).toBe(403);

      const del = await request(app.getHttpServer())
        .delete(url)
        .set(as(STOREKEEPER));
      expect(del.status).toBe(403);
      expect(suppliers.rows[0].isDeleted).toBe(false);
    });
  });

  describe('conflicts', () => {
    it('answers 409 to a duplicate active code in another case, and 201 once that supplier is deleted', async () => {
      const first = await request(app.getHttpServer())
        .post('/inventory/suppliers')
        .set(as(PURCHASING))
        .send(NEW_SUPPLIER);

      const duplicate = await request(app.getHttpServer())
        .post('/inventory/suppliers')
        .set(as(PURCHASING))
        .send({ ...NEW_SUPPLIER, code: 'ncc_0001' });
      expect(duplicate.status).toBe(409);

      const deleted = await request(app.getHttpServer())
        .delete(`/inventory/suppliers/${bodyOf(first).id}`)
        .set(as(DIRECTOR));
      expect(deleted.status).toBe(200);

      const reused = await request(app.getHttpServer())
        .post('/inventory/suppliers')
        .set(as(PURCHASING))
        .send(NEW_SUPPLIER);
      expect(reused.status).toBe(201);
    });

    it('answers 409 to delete, single and bulk, while a registered check reports a reference', async () => {
      const created = await request(app.getHttpServer())
        .post('/inventory/suppliers')
        .set(as(PURCHASING))
        .send(NEW_SUPPLIER);
      registry.register('purchase-order', (id) =>
        Promise.resolve(id === bodyOf(created).id),
      );

      const single = await request(app.getHttpServer())
        .delete(`/inventory/suppliers/${bodyOf(created).id}`)
        .set(as(PURCHASING));
      expect(single.status).toBe(409);

      const bulk = await request(app.getHttpServer())
        .post('/inventory/suppliers/bulk-delete')
        .set(as(PURCHASING))
        .send({ ids: [bodyOf(created).id] });
      expect(bodyOf(bulk).deleted).toEqual([]);
      expect(bodyOf(bulk).failed).toHaveLength(1);
      expect(suppliers.rows[0].isDeleted).toBe(false);
    });
  });

  describe('validation', () => {
    it('answers 400 to a blank code, a blank name and a malformed email', async () => {
      for (const body of [
        { ...NEW_SUPPLIER, code: '   ' },
        { ...NEW_SUPPLIER, name: '   ' },
        { ...NEW_SUPPLIER, email: 'not-an-email' },
      ]) {
        const res = await request(app.getHttpServer())
          .post('/inventory/suppliers')
          .set(as(PURCHASING))
          .send(body);
        expect(res.status).toBe(400);
      }
      expect(suppliers.rows).toHaveLength(0);
    });

    it('lets an update clear the email with an empty string', async () => {
      const created = await request(app.getHttpServer())
        .post('/inventory/suppliers')
        .set(as(PURCHASING))
        .send({ ...NEW_SUPPLIER, email: 'sales@thepviet.vn' });
      expect(created.status).toBe(201);

      const cleared = await request(app.getHttpServer())
        .patch(`/inventory/suppliers/${bodyOf(created).id}`)
        .set(as(PURCHASING))
        .send({ email: '' });
      expect(cleared.status).toBe(200);
      expect(suppliers.rows[0].email).toBeNull();
    });
  });
});
