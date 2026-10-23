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

import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';

import { DataScopeService } from '@shared/services/data-scope.service';

import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
import { ContactController } from '@plugins/crm/contact/contact.controller';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { ContactService } from '@plugins/crm/contact/services/contact.service';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';

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

function actor(userId: number, role: string): string {
  const permissions = seededRolePermissions(role);
  if (!permissions) throw new Error(`Role ${role} is not seeded`);
  return JSON.stringify({ userId, role, permissions });
}

const SALES_A = actor(11, 'sales');
const SALES_B = actor(12, 'sales');
const ENGINEER = actor(30, 'engineer');

interface ResponseBody {
  id: number;
  data: unknown[];
}
const bodyOf = (res: request.Response): ResponseBody =>
  res.body as ResponseBody;

describe('ContactController', () => {
  let app: INestApplication<App>;
  let contacts: FakeRepo<Contact & FakeRow>;
  let customerId: number;

  beforeEach(async () => {
    const customers = new FakeRepo<Customer & FakeRow>();
    customerId = customers.seed({
      code: 'KH_0001',
      name: 'Alpha',
      salesOwnerId: 11,
    } as Omit<Customer & FakeRow, 'id' | 'isDeleted'>).id;
    contacts = new FakeRepo<Contact & FakeRow>({
      join: (row) => ({
        customer: customers.rows.find((c) => c.id === row.customerId),
      }),
    });
    Object.assign(contacts, {
      manager: {
        transaction: <T>(work: (manager: unknown) => Promise<T>) =>
          work({ update: contacts.update, save: contacts.save }),
      },
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [
        ContactService,
        DataScopeService,
        { provide: getRepositoryToken(Contact), useValue: contacts },
        { provide: getRepositoryToken(Customer), useValue: customers },
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

  afterEach(async () => {
    await app.close();
  });

  const as = (token: string) => ({ 'x-test-actor': token });

  it('answers 403 without contact:create and 404 for another owner’s customer', async () => {
    const denied = await request(app.getHttpServer())
      .post('/contacts')
      .set(as(ENGINEER))
      .send({ customerId, name: 'Buyer' });
    expect(denied.status).toBe(403);

    const hidden = await request(app.getHttpServer())
      .post('/contacts')
      .set(as(SALES_B))
      .send({ customerId, name: 'Buyer' });
    expect(hidden.status).toBe(404);
  });

  it('clears an optional field sent as null and refuses a null or blank name', async () => {
    const created = await request(app.getHttpServer())
      .post('/contacts')
      .set(as(SALES_A))
      .send({
        customerId,
        name: 'Buyer',
        phone: '0900000000',
        email: 'buyer@example.com',
      });
    expect(created.status).toBe(201);
    const url = `/contacts/${bodyOf(created).id}`;

    const cleared = await request(app.getHttpServer())
      .patch(url)
      .set(as(SALES_A))
      .send({ phone: null, email: null });
    expect(cleared.status).toBe(200);
    expect(contacts.rows[0].phone).toBeNull();
    expect(contacts.rows[0].email).toBeNull();

    for (const name of [null, '', '   ']) {
      const res = await request(app.getHttpServer())
        .patch(url)
        .set(as(SALES_A))
        .send({ name });
      expect(res.status).toBe(400);
    }
    expect(contacts.rows[0].name).toBe('Buyer');
  });

  it('answers 400 to a whitespace-only name on create', async () => {
    const res = await request(app.getHttpServer())
      .post('/contacts')
      .set(as(SALES_A))
      .send({ customerId, name: '   ' });
    expect(res.status).toBe(400);
    expect(contacts.rows).toHaveLength(0);
  });
});
