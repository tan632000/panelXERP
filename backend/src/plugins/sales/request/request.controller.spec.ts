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
import { DataSource } from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';
import { PERMISSIONS_KEY } from '@kernel/core/auth/decorators/auth.decorators';
import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';
import { FilesController } from '@kernel/core/files/files.controller';
import { FilesService } from '@kernel/core/files/files.service';

import { DataScopeService } from '@shared/services/data-scope.service';
import { S3StorageService } from '@shared/services/s3-storage.service';

import { CrmGateway } from '@plugins/crm/_shared/gateways/crm-gateway';
import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';
import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';
import { SalesRequestAttachment } from '@plugins/sales/request/entities/request-attachment.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestAttachmentController } from '@plugins/sales/request/request-attachment.controller';
import {
  buildRequestFixture,
  type RequestFixture,
} from '@plugins/sales/request/request-fixture.helper-spec';
import { RequestController } from '@plugins/sales/request/request.controller';
import { RequestAttachmentService } from '@plugins/sales/request/services/request-attachment.service';
import { RequestService } from '@plugins/sales/request/services/request.service';

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
const ENGINEER_A = actor(30, 'engineer');
const ENGINEER_B = actor(31, 'engineer');
const LEAD = actor(40, 'engineeringLead');
const ADMIN = JSON.stringify({
  userId: 1,
  role: 'admin',
  permissions: ['*:*'],
});

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n', 'latin1');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

interface Body {
  id: number;
  code: string;
  status: string;
  message: string | string[];
  customer: { code: string; name: string; taxCode: string; address: string };
  project: { code: string; siteAddress: string };
  contact: { name: string; phone: string };
  data: Array<{ id: number }>;
  fileName: string;
  contentType: string;
}
const bodyOf = (res: request.Response): Body => res.body as Body;

describe('RequestController', () => {
  let app: INestApplication<App>;
  let fixture: RequestFixture;
  let customerId: number;
  let projectId: number;
  let contactId: number;

  beforeEach(async () => {
    fixture = buildRequestFixture({ registerReferenceChecks: false });
    customerId = fixture.customerOf(11).id;
    projectId = fixture.projectOf(customerId).id;
    contactId = fixture.contactOf(customerId).id;

    const moduleRef = await Test.createTestingModule({
      controllers: [
        RequestController,
        RequestAttachmentController,
        FilesController,
      ],
      providers: [
        { provide: RequestService, useValue: fixture.service },
        {
          provide: RequestAttachmentService,
          useValue: fixture.attachmentService,
        },
        FilesService,
        {
          provide: S3StorageService,
          useValue: {
            getSignedUrl: jest.fn().mockResolvedValue('https://signed'),
          },
        },
        // Present so the controllers' module graph resolves like the real one.
        DataScopeService,
        ReferenceCheckRegistry,
        RequestStatusPort,
        { provide: CrmGateway, useValue: fixture.crm },
        { provide: SalesUserLookup, useValue: fixture.users },
        { provide: NotificationService, useValue: fixture.notifications },
        { provide: DataSource, useValue: fixture.dataSource },
        {
          provide: getRepositoryToken(SalesRequest),
          useValue: fixture.requests,
        },
        {
          provide: getRepositoryToken(SalesRequestActivity),
          useValue: fixture.activities,
        },
        {
          provide: getRepositoryToken(SalesRequestAttachment),
          useValue: fixture.attachments,
        },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

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
  const server = () => app.getHttpServer();

  const create = (token = SALES_A, body: object = {}) =>
    request(server())
      .post('/sales/requests')
      .set(as(token))
      .send({ customerId, title: 'Panel line quote', ...body });

  const assign = (id: number, engineerId: number, token = SALES_A) =>
    request(server())
      .post(`/sales/requests/${id}/assign`)
      .set(as(token))
      .send({ engineerId });

  const upload = (
    id: number,
    name: string,
    bytes: Buffer,
    token = SALES_A,
    contentType = 'application/octet-stream',
  ) =>
    request(server())
      .post(`/sales/requests/${id}/attachments`)
      .set(as(token))
      .attach('file', bytes, { filename: name, contentType });

  describe('permissions', () => {
    it.each([
      ['RequestController', 'findAll', 'request:read'],
      ['RequestController', 'findOne', 'request:read'],
      ['RequestController', 'listActivities', 'request:read'],
      ['RequestController', 'create', 'request:create'],
      ['RequestController', 'update', 'request:update'],
      ['RequestController', 'assign', 'request:assign'],
      ['RequestController', 'cancel', 'request:cancel'],
      ['RequestController', 'markLost', 'request:cancel'],
      ['RequestController', 'listEngineerOptions', 'request:assign'],
      ['RequestAttachmentController', 'list', 'request:read'],
      ['RequestAttachmentController', 'download', 'request:read'],
      ['RequestAttachmentController', 'upload', 'request:update'],
      ['RequestAttachmentController', 'remove', 'request:update'],
    ])('guards %s.%s with %s', (controller, handler, permission) => {
      const target =
        controller === 'RequestController'
          ? RequestController
          : RequestAttachmentController;
      const method = Object.getOwnPropertyDescriptor(target.prototype, handler)
        ?.value as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([
        permission,
      ]);
    });

    it('answers 403 where the role lacks the permission, and changes nothing', async () => {
      const made = bodyOf(await create().expect(201));

      await create(ENGINEER_A).expect(403);
      await create(LEAD).expect(403);
      await request(server())
        .patch(`/sales/requests/${made.id}`)
        .set(as(ENGINEER_A))
        .send({ title: 'x' })
        .expect(403);
      await assign(made.id, 30, ENGINEER_A).expect(403);
      await request(server())
        .post(`/sales/requests/${made.id}/cancel`)
        .set(as(LEAD))
        .send({ reason: 'x' })
        .expect(403);
      await upload(made.id, 'a.pdf', PDF, ENGINEER_A).expect(403);
      expect(fixture.requests.rows).toHaveLength(1);
      expect(fixture.requests.rows[0].status).toBe('draft');
      expect(fixture.attachments.rows).toHaveLength(0);
    });
  });

  describe('create and validate', () => {
    it('creates a draft through the real pipe (201)', async () => {
      const res = await create(SALES_A, {
        projectId,
        contactId,
        technicalRequirements: 'PIR 50mm',
        requestedDeliveryDate: '2027-02-15',
        quotationDueDate: '2027-01-20',
      }).expect(201);

      expect(bodyOf(res)).toMatchObject({
        status: 'draft',
        code: expect.stringMatching(/^YC_\d{4}_0001$/) as string,
        project: { code: expect.any(String) as string },
      });
    });

    it.each([
      ['an unknown field', { status: 'won' }],
      [
        'a timestamp where a date is expected',
        { quotationDueDate: '2027-01-20T00:00:00Z' },
      ],
      ['an impossible date', { requestedDeliveryDate: '2027-02-30' }],
      ['a blank title', { title: '   ' }],
      ['a missing customer id', { customerId: undefined }],
      ['an owner of the client’s own choosing', { salesOwnerId: 12 }],
      ['a code of the client’s own choosing', { code: 'YC_2027_9999' }],
    ])('answers 400 for %s', async (_label, patch) => {
      await create(SALES_A, patch).expect(400);
      expect(fixture.requests.rows).toHaveLength(0);
    });

    it('answers 404 for a customer the caller does not own', async () => {
      await create(SALES_B).expect(404);
    });

    it('answers 400 for a project of another customer', async () => {
      const otherCustomer = fixture.customerOf(11, 'KH_0002').id;
      const foreign = fixture.projectOf(otherCustomer).id;

      await create(SALES_A, { projectId: foreign }).expect(400);
    });

    it('does not let a PATCH move the request to another customer or change its code', async () => {
      const made = bodyOf(await create().expect(201));

      await request(server())
        .patch(`/sales/requests/${made.id}`)
        .set(as(SALES_A))
        .send({ customerId: 5 })
        .expect(400);
      await request(server())
        .patch(`/sales/requests/${made.id}`)
        .set(as(SALES_A))
        .send({ code: 'YC_2027_0099' })
        .expect(400);
    });
  });

  describe('reading', () => {
    it('lets the assigned engineer read the detail, customer and project included, without customer:read', async () => {
      expect(seededRolePermissions('engineer')).not.toContain('customer:read');
      expect(seededRolePermissions('engineer')).not.toContain('project:read');
      const made = bodyOf(
        await create(SALES_A, { projectId, contactId }).expect(201),
      );
      await assign(made.id, 30).expect(200);

      const res = await request(server())
        .get(`/sales/requests/${made.id}`)
        .set(as(ENGINEER_A))
        .expect(200);

      expect(bodyOf(res)).toMatchObject({
        id: made.id,
        status: 'assigned',
        customer: {
          code: 'KH_0001',
          taxCode: '0101234567',
          address: '1 Demo Street',
        },
        project: { siteAddress: '1 Site Road' },
        contact: { name: 'Nguyen An', phone: '0900000001' },
      });
    });

    it('answers 404 to Sales B and to an unassigned engineer, and 200 to a manager and the lead', async () => {
      const made = bodyOf(await create().expect(201));
      await assign(made.id, 30).expect(200);
      const get = (token: string) =>
        request(server()).get(`/sales/requests/${made.id}`).set(as(token));

      await get(SALES_B).expect(404);
      await get(ENGINEER_B).expect(404);
      await get(MANAGER).expect(200);
      await get(LEAD).expect(200);
    });

    it('lists only what the caller’s scope reaches', async () => {
      const own = bodyOf(await create().expect(201));
      fixture.customerOf(12, 'KH_0002');
      await assign(own.id, 30).expect(200);

      const ids = async (token: string) =>
        bodyOf(
          await request(server())
            .get('/sales/requests')
            .set(as(token))
            .expect(200),
        ).data.map((row) => row.id);

      expect(await ids(SALES_A)).toEqual([own.id]);
      expect(await ids(SALES_B)).toEqual([]);
      expect(await ids(ENGINEER_A)).toEqual([own.id]);
      expect(await ids(ENGINEER_B)).toEqual([]);
      expect(await ids(MANAGER)).toEqual([own.id]);
    });

    it('rejects a malformed list filter (400)', async () => {
      await request(server())
        .get('/sales/requests?status=bogus')
        .set(as(MANAGER))
        .expect(400);
      await request(server())
        .get('/sales/requests?quotationDueFrom=tomorrow')
        .set(as(MANAGER))
        .expect(400);
    });
  });

  describe('assignment', () => {
    it('assigns, notifies the engineer once, and rejects an unsuitable assignee', async () => {
      const made = bodyOf(await create().expect(201));

      await assign(made.id, 12).expect(400); // a sales account
      await request(server())
        .post(`/sales/requests/${made.id}/assign`)
        .set(as(SALES_A))
        .send({})
        .expect(400);
      expect(fixture.notifications.emit).not.toHaveBeenCalled();

      const res = await assign(made.id, 30).expect(200);
      expect(bodyOf(res)).toMatchObject({ status: 'assigned' });
      expect(fixture.notifications.emit).toHaveBeenCalledTimes(1);
    });

    it('lets the lead assign, and Sales B not on someone else’s request', async () => {
      const made = bodyOf(await create().expect(201));

      await assign(made.id, 30, SALES_B).expect(404);
      await assign(made.id, 30, LEAD).expect(200);
    });

    it('offers the engineers to those who may assign', async () => {
      const res = await request(server())
        .get('/sales/requests/engineer-options')
        .set(as(SALES_A))
        .expect(200);

      expect(
        (res.body as Array<{ id: number }>).map((o) => o.id).sort(),
      ).toEqual([30, 31, 40]);
      await request(server())
        .get('/sales/requests/engineer-options')
        .set(as(ENGINEER_A))
        .expect(403);
    });
  });

  describe('closing', () => {
    it('cancels with a reason and refuses without one', async () => {
      const made = bodyOf(await create().expect(201));
      const cancel = (body: object) =>
        request(server())
          .post(`/sales/requests/${made.id}/cancel`)
          .set(as(SALES_A))
          .send(body);

      await cancel({}).expect(400);
      await cancel({ reason: '  ' }).expect(400);
      const res = await cancel({ reason: 'Customer withdrew' }).expect(200);

      expect(bodyOf(res).status).toBe('cancelled');
    });

    it('answers 409 for a lost mark on a draft and for an update after estimating', async () => {
      const made = bodyOf(await create().expect(201));
      await request(server())
        .post(`/sales/requests/${made.id}/lost`)
        .set(as(SALES_A))
        .send({ reason: 'Price' })
        .expect(409);

      fixture.requests.rows[0].status = 'estimating' as never;
      await request(server())
        .patch(`/sales/requests/${made.id}`)
        .set(as(SALES_A))
        .send({ title: 'Late edit' })
        .expect(409);
    });
  });

  describe('attachments', () => {
    it('stores a real PDF (201), whatever content type the client claims', async () => {
      const made = bodyOf(await create().expect(201));

      const res = await upload(
        made.id,
        'plan.pdf',
        PDF,
        SALES_A,
        'text/html',
      ).expect(201);

      expect(bodyOf(res)).toMatchObject({
        fileName: 'plan.pdf',
        contentType: 'application/pdf',
      });
    });

    it('rejects an .html file and a .pdf name with non-PDF bytes (400)', async () => {
      const made = bodyOf(await create().expect(201));

      await upload(made.id, 'evil.html', HTML, SALES_A, 'text/html').expect(
        400,
      );
      await upload(
        made.id,
        'fake.pdf',
        HTML,
        SALES_A,
        'application/pdf',
      ).expect(400);
      expect(fixture.attachments.rows).toHaveLength(0);
      expect(fixture.stored.size).toBe(0);
    });

    it('rejects a request carrying no file (400)', async () => {
      const made = bodyOf(await create().expect(201));

      await request(server())
        .post(`/sales/requests/${made.id}/attachments`)
        .set(as(SALES_A))
        .expect(400);
    });

    it('refuses a file over 20 MB (413)', async () => {
      const made = bodyOf(await create().expect(201));
      const big = Buffer.concat([PDF, Buffer.alloc(20 * 1024 * 1024)]);

      await upload(made.id, 'big.pdf', big).expect(413);
      expect(fixture.attachments.rows).toHaveLength(0);
    });

    it('downloads as an attachment, never inline, with sniffing disabled', async () => {
      const made = bodyOf(await create().expect(201));
      const saved = bodyOf(await upload(made.id, 'plan.pdf', PDF).expect(201));

      const res = await request(server())
        .get(`/sales/requests/${made.id}/attachments/${saved.id}`)
        .set(as(SALES_A))
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="plan\.pdf"/,
      );
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect((res.body as Buffer).equals(PDF)).toBe(true);
    });

    it('answers 404 to Sales B for Sales A’s request files: list, download, upload, delete', async () => {
      const made = bodyOf(await create().expect(201));
      const saved = bodyOf(await upload(made.id, 'plan.pdf', PDF).expect(201));
      const base = `/sales/requests/${made.id}/attachments`;

      await request(server()).get(base).set(as(SALES_B)).expect(404);
      await request(server())
        .get(`${base}/${saved.id}`)
        .set(as(SALES_B))
        .expect(404);
      await upload(made.id, 'b.pdf', PDF, SALES_B).expect(404);
      await request(server())
        .delete(`${base}/${saved.id}`)
        .set(as(SALES_B))
        .expect(404);
      expect(fixture.attachments.rows).toHaveLength(1);
    });

    it('lets the assigned engineer list and download but not upload or delete', async () => {
      const made = bodyOf(await create().expect(201));
      const saved = bodyOf(await upload(made.id, 'plan.pdf', PDF).expect(201));
      await assign(made.id, 30).expect(200);
      const base = `/sales/requests/${made.id}/attachments`;

      await request(server()).get(base).set(as(ENGINEER_A)).expect(200);
      await request(server())
        .get(`${base}/${saved.id}`)
        .set(as(ENGINEER_A))
        .expect(200);
      await upload(made.id, 'b.pdf', PDF, ENGINEER_A).expect(403);
      await request(server())
        .delete(`${base}/${saved.id}`)
        .set(as(ENGINEER_A))
        .expect(403);
      await request(server())
        .get(`${base}/${saved.id}`)
        .set(as(ENGINEER_B))
        .expect(404);
    });

    it('deletes a file while the request is open (200) and not after (409)', async () => {
      const made = bodyOf(await create().expect(201));
      const saved = bodyOf(await upload(made.id, 'plan.pdf', PDF).expect(201));
      const kept = bodyOf(await upload(made.id, 'keep.pdf', PDF).expect(201));
      const base = `/sales/requests/${made.id}/attachments`;

      await request(server())
        .delete(`${base}/${saved.id}`)
        .set(as(SALES_A))
        .expect(200);

      fixture.requests.rows[0].status = 'quoted' as never;
      await request(server())
        .delete(`${base}/${kept.id}`)
        .set(as(SALES_A))
        .expect(409);
    });
  });

  describe('kernel file route', () => {
    it('stays closed to a Sales actor even with the attachment’s own key (403)', async () => {
      const made = bodyOf(await create().expect(201));
      await upload(made.id, 'plan.pdf', PDF).expect(201);
      const [{ storageKey }] = fixture.attachments.rows;
      const fileId = Buffer.from(storageKey, 'utf8').toString('base64url');

      for (const token of [SALES_A, SALES_B, MANAGER, ENGINEER_A, LEAD]) {
        await request(server())
          .get(`/files/${fileId}`)
          .set(as(token))
          .expect(403);
      }
    });

    it('is the administrator’s alone: the route itself works (200)', async () => {
      const made = bodyOf(await create().expect(201));
      await upload(made.id, 'plan.pdf', PDF).expect(201);
      const [{ storageKey }] = fixture.attachments.rows;
      const fileId = Buffer.from(storageKey, 'utf8').toString('base64url');

      await request(server())
        .get(`/files/${fileId}`)
        .set(as(ADMIN))
        .expect(200);
    });
  });

  describe('timeline', () => {
    it('serves the timeline to those who can read the request', async () => {
      const made = bodyOf(await create().expect(201));
      await assign(made.id, 30).expect(200);

      const res = await request(server())
        .get(`/sales/requests/${made.id}/activities`)
        .set(as(ENGINEER_A))
        .expect(200);

      expect(
        (res.body as Array<{ action: string }>).map((a) => a.action),
      ).toEqual(['created', 'status_changed', 'assigned']);
      await request(server())
        .get(`/sales/requests/${made.id}/activities`)
        .set(as(SALES_B))
        .expect(404);
    });
  });
});
