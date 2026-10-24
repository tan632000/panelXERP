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
import { User } from '@kernel/core/users/entities/user.entity';

import { DataScopeService } from '@shared/services/data-scope.service';

import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
import { CustomerOwnerChangeRegistry } from '@plugins/crm/_shared/gateways/customer-owner-change-registry';
import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { CustomerController } from '@plugins/crm/customer/customer.controller';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { CustomerService } from '@plugins/crm/customer/services/customer.service';

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
const ENGINEER = actor(30, 'engineer');

interface ResponseBody {
  id: number;
  data: unknown[];
  deleted: number[];
  failed: unknown[];
}

const bodyOf = (res: request.Response): ResponseBody =>
  res.body as ResponseBody;

const NEW_CUSTOMER = { code: 'KH_0001', name: 'Alpha Panels' };

describe('CustomerController', () => {
  let app: INestApplication<App>;
  let registry: ReferenceCheckRegistry;
  let customers: FakeRepo<Customer & FakeRow>;

  beforeEach(async () => {
    customers = new FakeRepo<Customer & FakeRow>({
      unique: [
        {
          constraint: 'uq_customers_code_active',
          collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
        },
      ],
    });
    const users = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [CustomerController],
      providers: [
        CustomerService,
        DataScopeService,
        ReferenceCheckRegistry,
        CustomerOwnerChangeRegistry,
        { provide: getRepositoryToken(Customer), useValue: customers },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    registry = moduleRef.get(ReferenceCheckRegistry);
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
      ['create', 'customer:create'],
      ['update', 'customer:update'],
      ['remove', 'customer:delete'],
      ['findAll', 'customer:read'],
      ['findOne', 'customer:read'],
    ])('guards %s with %s', (handler, permission) => {
      const method = Object.getOwnPropertyDescriptor(
        CustomerController.prototype,
        handler,
      )?.value as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([
        permission,
      ]);
    });

    it('answers 403 to an actor without customer:create and creates nothing', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set(as(ENGINEER))
        .send(NEW_CUSTOMER);

      expect(res.status).toBe(403);
      expect(customers.rows).toHaveLength(0);
    });

    it('answers 403 to Sales on delete, which the matrix reserves for managers', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_A))
        .send(NEW_CUSTOMER);
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .delete(`/customers/${bodyOf(created).id}`)
        .set(as(SALES_A));

      expect(res.status).toBe(403);
      expect(customers.rows[0].isDeleted).toBe(false);
    });

    it('lets Sales create and read their own customer', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_A))
        .send(NEW_CUSTOMER);
      expect(created.status).toBe(201);
      expect(bodyOf(created)).toMatchObject({
        code: 'KH_0001',
        salesOwnerId: 11,
      });

      const read = await request(app.getHttpServer())
        .get(`/customers/${bodyOf(created).id}`)
        .set(as(SALES_A));
      expect(read.status).toBe(200);
    });
  });

  describe('owner scope', () => {
    it('answers 404, not 403, when Sales B reads Sales A’s customer', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_A))
        .send(NEW_CUSTOMER);

      const res = await request(app.getHttpServer())
        .get(`/customers/${bodyOf(created).id}`)
        .set(as(SALES_B));
      expect(res.status).toBe(404);

      const patch = await request(app.getHttpServer())
        .patch(`/customers/${bodyOf(created).id}`)
        .set(as(SALES_B))
        .send({ name: 'Stolen' });
      expect(patch.status).toBe(404);

      const asManager = await request(app.getHttpServer())
        .get(`/customers/${bodyOf(created).id}`)
        .set(as(MANAGER));
      expect(asManager.status).toBe(200);
    });

    it('lists only the caller’s customers to Sales', async () => {
      await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_A))
        .send(NEW_CUSTOMER);

      const forB = await request(app.getHttpServer())
        .get('/customers')
        .set(as(SALES_B));
      expect(forB.status).toBe(200);
      expect(bodyOf(forB).data).toEqual([]);

      const forA = await request(app.getHttpServer())
        .get('/customers')
        .set(as(SALES_A));
      expect(bodyOf(forA).data).toHaveLength(1);
    });
  });

  describe('conflicts', () => {
    it('answers 409 to a duplicate active code, and 201 once that customer is deleted', async () => {
      const first = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_A))
        .send(NEW_CUSTOMER);

      const duplicate = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_B))
        .send(NEW_CUSTOMER);
      expect(duplicate.status).toBe(409);

      const deleted = await request(app.getHttpServer())
        .delete(`/customers/${bodyOf(first).id}`)
        .set(as(MANAGER));
      expect(deleted.status).toBe(200);

      const reused = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_B))
        .send(NEW_CUSTOMER);
      expect(reused.status).toBe(201);
    });

    it('answers 409 to delete, single and bulk, while a registered check reports a reference', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_A))
        .send(NEW_CUSTOMER);
      registry.registerCustomerCheck('project', (id) =>
        Promise.resolve(id === bodyOf(created).id),
      );

      const single = await request(app.getHttpServer())
        .delete(`/customers/${bodyOf(created).id}`)
        .set(as(MANAGER));
      expect(single.status).toBe(409);

      const bulk = await request(app.getHttpServer())
        .post('/customers/bulk-delete')
        .set(as(MANAGER))
        .send({ ids: [bodyOf(created).id] });
      expect(bodyOf(bulk).deleted).toEqual([]);
      expect(bodyOf(bulk).failed).toHaveLength(1);
      expect(customers.rows[0].isDeleted).toBe(false);
    });
  });

  describe('validation', () => {
    it('answers 400 to a Sales actor naming another owner', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_A))
        .send({ ...NEW_CUSTOMER, salesOwnerId: 12 });
      expect(res.status).toBe(400);
    });

    it('lets an update clear the email with an empty string but refuses a malformed one', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_A))
        .send({ ...NEW_CUSTOMER, email: 'buyer@alpha.vn' });
      expect(created.status).toBe(201);

      const malformed = await request(app.getHttpServer())
        .patch(`/customers/${bodyOf(created).id}`)
        .set(as(SALES_A))
        .send({ email: 'not-an-email' });
      expect(malformed.status).toBe(400);

      const cleared = await request(app.getHttpServer())
        .patch(`/customers/${bodyOf(created).id}`)
        .set(as(SALES_A))
        .send({ email: '' });
      expect(cleared.status).toBe(200);
      expect(customers.rows[0].email).toBeNull();
    });

    it('clears an optional field sent as null and refuses a null or blank name', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_A))
        .send({
          ...NEW_CUSTOMER,
          taxCode: '0101234567',
          phone: '0900000000',
          email: 'buyer@example.com',
        });
      const url = `/customers/${bodyOf(created).id}`;

      const cleared = await request(app.getHttpServer())
        .patch(url)
        .set(as(SALES_A))
        .send({ taxCode: null, phone: null, email: null });
      expect(cleared.status).toBe(200);
      expect(customers.rows[0].taxCode).toBeNull();
      expect(customers.rows[0].phone).toBeNull();
      expect(customers.rows[0].email).toBeNull();

      for (const name of [null, '', '   ']) {
        const res = await request(app.getHttpServer())
          .patch(url)
          .set(as(SALES_A))
          .send({ name });
        expect(res.status).toBe(400);
      }
      expect(customers.rows[0].name).toBe('Alpha Panels');
    });

    it('answers 400 to a whitespace-only name on create', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_A))
        .send({ code: 'KH_0001', name: '   ' });
      expect(res.status).toBe(400);
      expect(customers.rows).toHaveLength(0);
    });

    it('answers 400 to a code outside the KH_ shape', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set(as(SALES_A))
        .send({ code: 'XX_0001', name: 'Alpha' });
      expect(res.status).toBe(400);
    });
  });
});
