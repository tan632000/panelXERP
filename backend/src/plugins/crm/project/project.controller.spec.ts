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

import { DataScopeService } from '@shared/services/data-scope.service';

import {
  FakeRepo,
  type FakeRow,
} from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';
import { ProjectController } from '@plugins/crm/project/project.controller';
import { ProjectService } from '@plugins/crm/project/services/project.service';

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

interface TemplateBody {
  quotationTemplateId: number | null;
  quotationTemplateName: string | null;
}

const bodyOf = (res: request.Response): ResponseBody =>
  res.body as ResponseBody;

describe('ProjectController', () => {
  let app: INestApplication<App>;
  let registry: ReferenceCheckRegistry;
  let projects: FakeRepo<Project & FakeRow>;
  let customerId: number;
  let templateRows: Array<{
    id: number;
    name: string;
    isActive: boolean;
    isDeleted: boolean;
  }>;
  let newProject: { code: string; customerId: number; name: string };

  beforeEach(async () => {
    const customers = new FakeRepo<Customer & FakeRow>();
    customerId = customers.seed({
      code: 'KH_0001',
      name: 'Alpha',
      salesOwnerId: 11,
    } as Omit<Customer & FakeRow, 'id' | 'isDeleted'>).id;
    newProject = { code: 'DA_0001', customerId, name: 'Tower A' };
    projects = new FakeRepo<Project & FakeRow>({
      join: (row) => ({
        customer: customers.rows.find((c) => c.id === row.customerId),
      }),
      unique: [
        {
          constraint: 'uq_projects_code_active',
          collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
        },
      ],
    });

    // The service reads quotation_templates through the repo's manager: one query to validate an
    // assignment (live and active only) and one to name the templates a view shows.
    templateRows = [
      { id: 1, name: 'Main board', isActive: true, isDeleted: false },
      { id: 2, name: 'Retired', isActive: false, isDeleted: false },
      { id: 3, name: 'Gone', isActive: true, isDeleted: true },
    ];
    projects.manager = {
      ...projects.manager,
      query: jest.fn((sql: string, [param]: [number | number[]]) => {
        const ids = Array.isArray(param) ? param : [param];
        const found = templateRows.filter(
          (row) =>
            ids.includes(row.id) &&
            (!sql.includes('is_active') || (row.isActive && !row.isDeleted)),
        );
        return Promise.resolve(found);
      }),
    } as never;

    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [
        ProjectService,
        DataScopeService,
        ReferenceCheckRegistry,
        { provide: getRepositoryToken(Project), useValue: projects },
        { provide: getRepositoryToken(Customer), useValue: customers },
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

  describe('permissions', () => {
    it.each([
      ['create', 'project:create'],
      ['update', 'project:update'],
      ['remove', 'project:delete'],
      ['findAll', 'project:read'],
      ['findOne', 'project:read'],
    ])('guards %s with %s', (handler, permission) => {
      const method = Object.getOwnPropertyDescriptor(
        ProjectController.prototype,
        handler,
      )?.value as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([
        permission,
      ]);
    });

    it('answers 403 to an actor without project:create and creates nothing', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set(as(ENGINEER))
        .send(newProject);

      expect(res.status).toBe(403);
      expect(projects.rows).toHaveLength(0);
    });

    it('answers 403 to Sales on delete, which the matrix reserves for managers', async () => {
      const created = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send(newProject);
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .delete(`/projects/${bodyOf(created).id}`)
        .set(as(SALES_A));

      expect(res.status).toBe(403);
      expect(projects.rows[0].isDeleted).toBe(false);
    });
  });

  describe('owner scope', () => {
    it('answers 404, not 403, when Sales B reads, patches or deletes Sales A’s project', async () => {
      const created = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send(newProject);
      const url = `/projects/${bodyOf(created).id}`;

      const read = await request(app.getHttpServer()).get(url).set(as(SALES_B));
      expect(read.status).toBe(404);

      const patch = await request(app.getHttpServer())
        .patch(url)
        .set(as(SALES_B))
        .send({ name: 'Stolen' });
      expect(patch.status).toBe(404);

      const asManager = await request(app.getHttpServer())
        .get(url)
        .set(as(MANAGER));
      expect(asManager.status).toBe(200);
    });

    it('answers 404 to a create under another owner’s customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_B))
        .send(newProject);

      expect(res.status).toBe(404);
      expect(projects.rows).toHaveLength(0);
    });

    it('lists only the caller’s projects to Sales', async () => {
      await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send(newProject);

      const forB = await request(app.getHttpServer())
        .get('/projects')
        .set(as(SALES_B));
      expect(bodyOf(forB).data).toEqual([]);

      const forA = await request(app.getHttpServer())
        .get('/projects')
        .set(as(SALES_A));
      expect(bodyOf(forA).data).toHaveLength(1);
    });
  });

  describe('conflicts', () => {
    it('answers 409 to a duplicate active code, and 201 once that project is deleted', async () => {
      const first = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send(newProject);

      const duplicate = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send(newProject);
      expect(duplicate.status).toBe(409);

      const deleted = await request(app.getHttpServer())
        .delete(`/projects/${bodyOf(first).id}`)
        .set(as(MANAGER));
      expect(deleted.status).toBe(200);

      const reused = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send(newProject);
      expect(reused.status).toBe(201);
    });

    it('answers 409 to delete, single and bulk, while a registered check reports a reference', async () => {
      const created = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send(newProject);
      registry.registerProjectCheck('request', (id) =>
        Promise.resolve(id === bodyOf(created).id),
      );

      const single = await request(app.getHttpServer())
        .delete(`/projects/${bodyOf(created).id}`)
        .set(as(MANAGER));
      expect(single.status).toBe(409);

      const bulk = await request(app.getHttpServer())
        .post('/projects/bulk-delete')
        .set(as(MANAGER))
        .send({ ids: [bodyOf(created).id] });
      expect(bodyOf(bulk).deleted).toEqual([]);
      expect(bodyOf(bulk).failed).toHaveLength(1);
      expect(projects.rows[0].isDeleted).toBe(false);
    });
  });

  describe('quotation template', () => {
    const post = (body: object) =>
      request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send(body);
    const patch = (id: number, body: object) =>
      request(app.getHttpServer())
        .patch(`/projects/${id}`)
        .set(as(SALES_A))
        .send(body);
    const detail = async (id: number) =>
      (
        await request(app.getHttpServer())
          .get(`/projects/${id}`)
          .set(as(SALES_A))
      ).body as TemplateBody;

    it('creates a project without a template as before', async () => {
      const res = await post(newProject);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        quotationTemplateId: null,
        quotationTemplateName: null,
      });
    });

    it('stores a live active template and returns it on detail and list', async () => {
      const res = await post({ ...newProject, quotationTemplateId: 1 });
      expect(res.status).toBe(201);

      expect(await detail(bodyOf(res).id)).toMatchObject({
        quotationTemplateId: 1,
        quotationTemplateName: 'Main board',
      });
      const list = await request(app.getHttpServer())
        .get('/projects')
        .set(as(SALES_A));
      expect((list.body as { data: TemplateBody[] }).data[0]).toMatchObject({
        quotationTemplateId: 1,
        quotationTemplateName: 'Main board',
      });
    });

    it.each([
      ['unknown', 99],
      ['inactive', 2],
      ['deleted', 3],
    ])(
      'answers 400 to a %s template on create and stores nothing',
      async (_l, id) => {
        const res = await post({ ...newProject, quotationTemplateId: id });
        expect(res.status).toBe(400);
        expect(projects.rows).toHaveLength(0);
      },
    );

    it('sets, rejects and clears the template on PATCH', async () => {
      const id = bodyOf(await post(newProject)).id;

      expect((await patch(id, { quotationTemplateId: 2 })).status).toBe(400);
      expect(projects.rows[0].quotationTemplateId ?? null).toBeNull();

      expect((await patch(id, { quotationTemplateId: 1 })).status).toBe(200);
      expect(projects.rows[0].quotationTemplateId).toBe(1);

      // A name edit leaves the template alone; null clears it.
      expect((await patch(id, { name: 'Renamed' })).status).toBe(200);
      expect(projects.rows[0].quotationTemplateId).toBe(1);
      const cleared = await patch(id, { quotationTemplateId: null });
      expect(cleared.status).toBe(200);
      expect(projects.rows[0].quotationTemplateId).toBeNull();
    });

    it('keeps naming a template that was deactivated after the assignment', async () => {
      const id = bodyOf(
        await post({ ...newProject, quotationTemplateId: 1 }),
      ).id;
      templateRows[0].isActive = false;
      expect(await detail(id)).toMatchObject({
        quotationTemplateId: 1,
        quotationTemplateName: 'Main board',
      });
    });
  });

  describe('validation', () => {
    it('rejects a body naming customerId on PATCH and leaves the project untouched', async () => {
      const created = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send(newProject);

      const res = await request(app.getHttpServer())
        .patch(`/projects/${bodyOf(created).id}`)
        .set(as(SALES_A))
        .send({ customerId: 999, name: 'Moved' });

      expect(res.status).toBe(400);
      expect(projects.rows[0]).toMatchObject({ customerId, name: 'Tower A' });
    });

    it('clears an optional field sent as null and refuses a null or blank name', async () => {
      const created = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send({ ...newProject, siteAddress: '1 Site Road', note: 'Phase 1' });
      const url = `/projects/${bodyOf(created).id}`;

      const cleared = await request(app.getHttpServer())
        .patch(url)
        .set(as(SALES_A))
        .send({ siteAddress: null, note: null });
      expect(cleared.status).toBe(200);
      expect(projects.rows[0].siteAddress).toBeNull();
      expect(projects.rows[0].note).toBeNull();

      for (const name of [null, '', '   ']) {
        const res = await request(app.getHttpServer())
          .patch(url)
          .set(as(SALES_A))
          .send({ name });
        expect(res.status).toBe(400);
      }
      expect(projects.rows[0].name).toBe('Tower A');
    });

    it('answers 400 to a whitespace-only name and to a code outside the DA_ shape on create', async () => {
      const blank = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send({ ...newProject, name: '   ' });
      expect(blank.status).toBe(400);

      const badCode = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send({ ...newProject, code: 'XX_0001' });
      expect(badCode.status).toBe(400);
      expect(projects.rows).toHaveLength(0);
    });

    it('answers 400 to a create without a customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set(as(SALES_A))
        .send({ code: 'DA_0001', name: 'Tower A' });
      expect(res.status).toBe(400);
    });
  });
});
