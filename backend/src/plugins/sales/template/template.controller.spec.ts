import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, FindOperator } from 'typeorm';

import { PERMISSIONS_KEY } from '@kernel/core/auth/decorators/auth.decorators';
import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';

import { MAX_BOM_QUANTITY } from '@plugins/sales/estimate/constants/estimate.constant';
import { SalesFakeRepo } from '@plugins/sales/request/request-fixture.helper-spec';
import { QuotationTemplateLine } from '@plugins/sales/template/entities/quotation-template-line.entity';
import { QuotationTemplatePanel } from '@plugins/sales/template/entities/quotation-template-panel.entity';
import { QuotationTemplate } from '@plugins/sales/template/entities/quotation-template.entity';
import { QuotationTemplateService } from '@plugins/sales/template/services/quotation-template.service';
import { TemplateController } from '@plugins/sales/template/template.controller';

import type { FakeRow } from '@plugins/crm/_shared/crm-fake-repo.helper-spec';
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

const SALES = actor(11, 'sales');
const MANAGER = actor(20, 'salesManager');
const ENGINEER = actor(30, 'engineer');
const LEAD = actor(40, 'engineeringLead');
const PURCHASING = actor(50, 'purchasing');
const DIRECTOR = actor(51, 'director');
const ADMIN = JSON.stringify({
  userId: 1,
  role: 'admin',
  permissions: ['*:*'],
});

type Row<T> = T & FakeRow;

/** The line table takes the array `save` the real repository accepts. */
class LineFakeRepo extends SalesFakeRepo<Row<QuotationTemplateLine>> {
  constructor() {
    super();
    const saveOne = this.save;
    this.save = jest.fn((entity: unknown) =>
      Array.isArray(entity)
        ? Promise.all(entity.map((one) => saveOne(one as never)))
        : saveOne(entity as never),
    ) as never;
  }
}

/** Whether the `unaccentILike` branch (a `%keyword%` pattern) matches the column value. */
function containsKeyword(value: unknown, condition: FindOperator<unknown>) {
  const [pattern] = Object.values(
    condition.objectLiteralParameters as Record<string, string>,
  );
  const keyword = pattern.slice(1, -1).replace(/\\([\\%_])/g, '$1');
  return (
    typeof value === 'string' &&
    value.toLowerCase().includes(keyword.toLowerCase())
  );
}

interface LineBody {
  itemId: number;
  quantity: number;
  itemCode: string;
}
interface PanelBody {
  tag: string;
  quantity: number;
  lines: LineBody[];
}
interface Body {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  message: string | string[];
  data: Array<{ id: number; code: string }>;
  panels: PanelBody[];
}
const bodyOf = (res: request.Response): Body => res.body as Body;

const LIVE_ITEM = 1;
const OTHER_LIVE_ITEM = 2;
const DELETED_ITEM = 3;

describe('TemplateController', () => {
  let app: INestApplication<App>;
  let templates: SalesFakeRepo<Row<QuotationTemplate>>;
  let panels: SalesFakeRepo<Row<QuotationTemplatePanel>>;
  let lines: LineFakeRepo;
  let itemQuery: jest.Mock;
  /** Template ids a live project currently names. */
  let projectTemplateIds: Set<number>;

  beforeEach(async () => {
    projectTemplateIds = new Set();
    templates = new SalesFakeRepo({
      unique: [
        {
          constraint: 'uq_quotation_templates_code_active',
          collides: (a, b) => a.code.toLowerCase() === b.code.toLowerCase(),
        },
      ],
    });
    panels = new SalesFakeRepo({
      unique: [
        {
          constraint: 'uq_quotation_template_panels_tag',
          collides: (a, b) =>
            a.templateId === b.templateId &&
            a.tag.toLowerCase() === b.tag.toLowerCase(),
        },
      ],
    });
    lines = new LineFakeRepo();

    const items = [
      { id: LIVE_ITEM, code: 'CB-1', isDeleted: false },
      { id: OTHER_LIVE_ITEM, code: 'CB-2', isDeleted: false },
      { id: DELETED_ITEM, code: 'CB-3', isDeleted: true },
    ].map((item) => ({
      ...item,
      name: `Item ${item.code}`,
      brand: 'LS',
      unit: 'Cái',
    }));
    const repos = new Map<unknown, SalesFakeRepo<FakeRow>>([
      [QuotationTemplate, templates],
      [QuotationTemplatePanel, panels],
      [QuotationTemplateLine, lines],
    ] as Array<[unknown, SalesFakeRepo<FakeRow>]>);
    // The shared fake ignores `order` and cannot read the pattern `unaccentILike` binds, so
    // this table evaluates the keyword branches and the code ordering the list asks for.
    templates.findAndCount.mockImplementation((options) => {
      const {
        where,
        skip = 0,
        take,
        order,
      } = options as typeof options & {
        order?: { code?: 'ASC' | 'DESC' };
      };
      const branches = (Array.isArray(where) ? where : [where]) as Array<
        Record<string, unknown>
      >;
      const rows = templates.rows
        .filter((row) => !row.deletedAt)
        .filter((row) =>
          branches.some((branch) =>
            Object.entries(branch).every(([key, condition]) =>
              condition instanceof FindOperator
                ? containsKeyword(row[key as keyof typeof row], condition)
                : row[key as keyof typeof row] === condition,
            ),
          ),
        )
        .sort((a, b) => (order?.code ? a.code.localeCompare(b.code) : 0));
      const end = take === undefined ? undefined : skip + take;
      return Promise.resolve([rows.slice(skip, end), rows.length]);
    });
    const manager = {
      getRepository: (target: unknown) => repos.get(target),
      /** The two item reads: the live-item lock and the display lookup. */
      query: jest.fn((sql: string, [ids]: [number[] | number]) => {
        // The delete guard asks the projects table whether a live project names the template.
        if (sql.includes('FROM projects')) {
          return Promise.resolve(
            projectTemplateIds.has(ids as number) ? [{ '?column?': 1 }] : [],
          );
        }
        return Promise.resolve(
          items.filter(
            (item) =>
              (ids as number[]).includes(item.id) &&
              (!sql.includes('is_deleted = false') || !item.isDeleted),
          ),
        );
      }),
    };
    itemQuery = manager.query;
    const dataSource = {
      manager,
      /** Runs `work` and, when it throws, puts every table back as it was. */
      transaction: jest.fn(
        async <R>(work: (m: typeof manager) => Promise<R>) => {
          const snapshots = [...repos.values()].map((repo) => ({
            repo,
            rows: repo.rows.map((row) => ({ ...row })),
          }));
          try {
            return await work(manager);
          } catch (error) {
            for (const { repo, rows } of snapshots) repo.rows = rows;
            throw error;
          }
        },
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TemplateController],
      providers: [
        QuotationTemplateService,
        { provide: DataSource, useValue: dataSource },
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
  const BASE = '/sales/quotation-templates';

  const newTemplate = (overrides: Record<string, unknown> = {}) => ({
    code: 'TPL_0100',
    name: 'Main board',
    panels: [
      {
        tag: 'MSB-01',
        quantity: 2,
        lines: [
          { itemId: LIVE_ITEM, quantity: 3, groupLabel: 'Incomer' },
          { itemId: OTHER_LIVE_ITEM, quantity: 1.5 },
        ],
      },
    ],
    ...overrides,
  });

  const create = (token: string, body: object = newTemplate()) =>
    request(server()).post(BASE).set(as(token)).send(body);

  describe('permissions', () => {
    it.each([
      ['findAll', 'quotation_template:read'],
      ['findOne', 'quotation_template:read'],
      ['create', 'quotation_template:create'],
      ['update', 'quotation_template:update'],
      ['deactivate', 'quotation_template:update'],
      ['activate', 'quotation_template:update'],
      ['remove', 'quotation_template:delete'],
    ])('guards %s with %s', (handler, permission) => {
      const method = Object.getOwnPropertyDescriptor(
        TemplateController.prototype,
        handler,
      )?.value as object;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual([
        permission,
      ]);
    });

    it.each([
      ['salesManager', MANAGER],
      ['engineeringLead', LEAD],
      ['director', DIRECTOR],
      ['admin', ADMIN],
    ])('lets %s create a template', async (_role, token) => {
      const res = await create(token);
      expect(res.status).toBe(201);
      expect(bodyOf(res).code).toBe('TPL_0100');
    });

    it.each([
      ['sales', SALES],
      ['engineer', ENGINEER],
      ['purchasing', PURCHASING],
    ])(
      'answers 403 to %s creating and stores nothing',
      async (_role, token) => {
        const res = await create(token);
        expect(res.status).toBe(403);
        expect(templates.rows).toHaveLength(0);
      },
    );

    it.each([
      ['sales', SALES],
      ['engineer', ENGINEER],
      ['salesManager', MANAGER],
      ['engineeringLead', LEAD],
    ])('lets %s read the list and a template', async (_role, token) => {
      const { id } = bodyOf(await create(ADMIN));
      expect((await request(server()).get(BASE).set(as(token))).status).toBe(
        200,
      );
      expect(
        (await request(server()).get(`${BASE}/${id}`).set(as(token))).status,
      ).toBe(200);
    });

    it('answers 403 to an actor without quotation_template:read', async () => {
      const res = await request(server()).get(BASE).set(as(PURCHASING));
      expect(res.status).toBe(403);
    });

    it('keeps update, deactivate and delete from a read-only role', async () => {
      const { id } = bodyOf(await create(ADMIN));
      for (const [method, path, body] of [
        ['patch', `${BASE}/${id}`, { name: 'X' }],
        ['post', `${BASE}/${id}/deactivate`, {}],
        ['post', `${BASE}/${id}/activate`, {}],
        ['delete', `${BASE}/${id}`, undefined],
      ] as const) {
        for (const token of [SALES, ENGINEER]) {
          const res = await request(server())
            [method](path)
            .set(as(token))
            .send(body);
          expect(res.status).toBe(403);
        }
      }
      expect(templates.rows[0].isActive).toBe(true);
      expect(templates.rows[0].deletedAt).toBeUndefined();
    });
  });

  describe('create', () => {
    it('stores the template with its panels and lines and shows each line’s item', async () => {
      const res = await create(MANAGER);
      expect(res.status).toBe(201);
      const body = bodyOf(res);
      expect(body.isActive).toBe(true);
      expect(body.panels).toHaveLength(1);
      expect(body.panels[0]).toMatchObject({ tag: 'MSB-01', quantity: 2 });
      expect(body.panels[0].lines).toEqual([
        expect.objectContaining({
          itemId: LIVE_ITEM,
          quantity: 3,
          itemCode: 'CB-1',
        }),
        expect.objectContaining({ itemId: OTHER_LIVE_ITEM, quantity: 1.5 }),
      ]);
      const fetched = await request(server())
        .get(`${BASE}/${body.id}`)
        .set(as(SALES));
      expect(bodyOf(fetched).panels[0].lines).toHaveLength(2);
    });

    it('answers 400 for an item that does not exist and stores nothing', async () => {
      const res = await create(
        MANAGER,
        newTemplate({
          panels: [
            { tag: 'A', quantity: 1, lines: [{ itemId: 999, quantity: 1 }] },
          ],
        }),
      );
      expect(res.status).toBe(400);
      expect(templates.rows).toHaveLength(0);
      expect(panels.rows).toHaveLength(0);
    });

    it('answers 400 for a deleted item', async () => {
      const res = await create(
        MANAGER,
        newTemplate({
          panels: [
            {
              tag: 'A',
              quantity: 1,
              lines: [{ itemId: DELETED_ITEM, quantity: 1 }],
            },
          ],
        }),
      );
      expect(res.status).toBe(400);
      expect(templates.rows).toHaveLength(0);
    });

    it.each([
      ['zero', 0],
      ['negative', -1],
      ['over the cap', MAX_BOM_QUANTITY + 1],
      ['too many decimals', 1.2345],
    ])('answers 400 for a line quantity %s', async (_label, quantity) => {
      const res = await create(
        MANAGER,
        newTemplate({
          panels: [
            { tag: 'A', quantity: 1, lines: [{ itemId: LIVE_ITEM, quantity }] },
          ],
        }),
      );
      expect(res.status).toBe(400);
      expect(templates.rows).toHaveLength(0);
    });

    it('accepts the largest quantity', async () => {
      const res = await create(
        MANAGER,
        newTemplate({
          panels: [
            {
              tag: 'A',
              quantity: 1,
              lines: [{ itemId: LIVE_ITEM, quantity: MAX_BOM_QUANTITY }],
            },
          ],
        }),
      );
      expect(res.status).toBe(201);
    });

    it('answers 400 for a code without the TPL_ prefix', async () => {
      const res = await create(MANAGER, newTemplate({ code: 'XYZ_0001' }));
      expect(res.status).toBe(400);
    });

    it('answers 409 for a code in use, whatever its case', async () => {
      expect(
        (await create(MANAGER, newTemplate({ code: 'TPL_0100A' }))).status,
      ).toBe(201);
      const res = await create(MANAGER, newTemplate({ code: 'TPL_0100a' }));
      expect(res.status).toBe(409);
      expect(templates.rows).toHaveLength(1);
    });

    it('answers 409 when the unique index catches a code a concurrent create took', async () => {
      expect((await create(MANAGER)).status).toBe(201);
      // The pre-check misses it, as it would for a row committed a moment later.
      templates.findOne.mockResolvedValueOnce(null);
      const res = await create(MANAGER);
      expect(res.status).toBe(409);
      expect(templates.rows).toHaveLength(1);
    });

    it('answers 409 for a panel tag used twice, whatever its case', async () => {
      const res = await create(
        MANAGER,
        newTemplate({
          panels: [
            { tag: 'MSB-01', quantity: 1, lines: [] },
            { tag: 'msb-01', quantity: 1, lines: [] },
          ],
        }),
      );
      expect(res.status).toBe(409);
      expect(templates.rows).toHaveLength(0);
    });

    it('frees the code of a deleted template', async () => {
      const { id } = bodyOf(await create(MANAGER));
      await request(server()).delete(`${BASE}/${id}`).set(as(MANAGER));
      expect((await create(MANAGER)).status).toBe(201);
    });
  });

  describe('update', () => {
    const REPLACEMENT = [
      {
        tag: 'DB-1',
        quantity: 1,
        lines: [{ itemId: OTHER_LIVE_ITEM, quantity: 9 }],
      },
      { tag: 'DB-2', quantity: 4, lines: [] },
    ];

    it('replaces every panel and line and keeps the code', async () => {
      const { id } = bodyOf(await create(MANAGER));
      const res = await request(server())
        .patch(`${BASE}/${id}`)
        .set(as(LEAD))
        .send({ code: 'TPL_0100', name: 'Renamed', panels: REPLACEMENT });
      expect(res.status).toBe(200);
      const body = bodyOf(res);
      expect(body.name).toBe('Renamed');
      expect(body.panels.map((p) => p.tag)).toEqual(['DB-1', 'DB-2']);
      expect(body.panels[0].lines).toHaveLength(1);
      expect(panels.rows.map((p) => p.tag)).toEqual(['DB-1', 'DB-2']);
      expect(lines.rows).toHaveLength(1);
    });

    it('leaves the panels alone when the body sends none', async () => {
      const { id } = bodyOf(await create(MANAGER));
      const res = await request(server())
        .patch(`${BASE}/${id}`)
        .set(as(MANAGER))
        .send({ name: 'Only the name' });
      expect(res.status).toBe(200);
      expect(bodyOf(res).panels[0].lines).toHaveLength(2);
    });

    it('answers 400 to a changed code', async () => {
      const { id } = bodyOf(await create(MANAGER));
      const res = await request(server())
        .patch(`${BASE}/${id}`)
        .set(as(MANAGER))
        .send({ code: 'TPL_0200' });
      expect(res.status).toBe(400);
    });

    it('answers 400 for an item that is not live and keeps the old content', async () => {
      const { id } = bodyOf(await create(MANAGER));
      const res = await request(server())
        .patch(`${BASE}/${id}`)
        .set(as(MANAGER))
        .send({
          panels: [
            { tag: 'X', quantity: 1, lines: [{ itemId: 999, quantity: 1 }] },
          ],
        });
      expect(res.status).toBe(400);
      expect(panels.rows.map((p) => p.tag)).toEqual(['MSB-01']);
      expect(lines.rows).toHaveLength(2);
    });

    it('answers 409 for a tag used twice and keeps the old content', async () => {
      const { id } = bodyOf(await create(MANAGER));
      const res = await request(server())
        .patch(`${BASE}/${id}`)
        .set(as(MANAGER))
        .send({
          panels: [
            { tag: 'A', quantity: 1, lines: [] },
            { tag: 'a', quantity: 1, lines: [] },
          ],
        });
      expect(res.status).toBe(409);
      expect(panels.rows.map((p) => p.tag)).toEqual(['MSB-01']);
    });

    it('rolls the whole replacement back when it fails part-way', async () => {
      const { id } = bodyOf(await create(MANAGER));
      // The old panels are already gone and a new one stored when the lines fail.
      lines.save.mockRejectedValueOnce(new Error('disk full'));
      const res = await request(server())
        .patch(`${BASE}/${id}`)
        .set(as(MANAGER))
        .send({ name: 'Half done', panels: REPLACEMENT });
      expect(res.status).toBe(500);

      const after = bodyOf(
        await request(server()).get(`${BASE}/${id}`).set(as(MANAGER)),
      );
      expect(after.name).toBe('Main board');
      expect(after.panels.map((p) => p.tag)).toEqual(['MSB-01']);
      expect(after.panels[0].lines).toHaveLength(2);
    });

    it('answers 404 for a template that does not exist', async () => {
      const res = await request(server())
        .patch(`${BASE}/999`)
        .set(as(MANAGER))
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('deactivate, activate and delete', () => {
    const listIds = async (query = '') =>
      bodyOf(
        await request(server()).get(`${BASE}${query}`).set(as(SALES)),
      ).data.map((row) => row.id);

    it('deactivates then activates, and the active filter follows', async () => {
      const { id } = bodyOf(await create(MANAGER));

      const off = await request(server())
        .post(`${BASE}/${id}/deactivate`)
        .set(as(MANAGER));
      expect(off.status).toBe(200);
      expect(bodyOf(off).isActive).toBe(false);
      expect(await listIds('?isActive=true')).toEqual([]);
      expect(await listIds('?isActive=false')).toEqual([id]);

      const on = await request(server())
        .post(`${BASE}/${id}/activate`)
        .set(as(MANAGER));
      expect(on.status).toBe(200);
      expect(bodyOf(on).isActive).toBe(true);
      expect(await listIds('?isActive=true')).toEqual([id]);
    });

    it('answers 400 to an isActive filter that is not a boolean', async () => {
      const res = await request(server())
        .get(`${BASE}?isActive=maybe`)
        .set(as(SALES));
      expect(res.status).toBe(400);
    });

    it('soft-deletes a template: gone from the list and from a read', async () => {
      const { id } = bodyOf(await create(MANAGER));
      expect(await listIds()).toEqual([id]);

      const res = await request(server())
        .delete(`${BASE}/${id}`)
        .set(as(MANAGER));
      expect(res.status).toBe(200);
      expect(bodyOf(res).id).toBe(id);
      expect(templates.rows[0].deletedAt).toBeInstanceOf(Date);
      expect(await listIds()).toEqual([]);
      expect(
        (await request(server()).get(`${BASE}/${id}`).set(as(MANAGER))).status,
      ).toBe(404);
    });
  });

  describe('delete guard', () => {
    it('answers 409 while a live project uses the template, then 200 once it does not', async () => {
      const { id } = bodyOf(await create(MANAGER));
      projectTemplateIds.add(id);

      const blocked = await request(server())
        .delete(`${BASE}/${id}`)
        .set(as(MANAGER));
      expect(blocked.status).toBe(409);
      expect(templates.rows[0].deletedAt).toBeUndefined();

      projectTemplateIds.delete(id);
      const freed = await request(server())
        .delete(`${BASE}/${id}`)
        .set(as(MANAGER));
      expect(freed.status).toBe(200);
      expect(templates.rows[0].deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('list', () => {
    const codesOf = async (query = '') =>
      bodyOf(
        await request(server()).get(`${BASE}${query}`).set(as(SALES)),
      ).data.map((row) => row.code);

    beforeEach(async () => {
      for (const [code, name] of [
        ['TPL_0003', 'Beta board'],
        ['TPL_0001', 'Alpha board'],
        ['TPL_0002', 'Gamma'],
      ]) {
        await create(MANAGER, { code, name, panels: [] });
      }
    });

    it('lists by code ascending, whatever the creation order', async () => {
      expect(await codesOf()).toEqual(['TPL_0001', 'TPL_0002', 'TPL_0003']);
    });

    it('searches the name, in any case', async () => {
      expect(await codesOf('?search=BOARD')).toEqual(['TPL_0001', 'TPL_0003']);
      expect(await codesOf('?search=alpha')).toEqual(['TPL_0001']);
    });

    it('searches the code', async () => {
      expect(await codesOf('?search=0002')).toEqual(['TPL_0002']);
    });

    it('returns nothing for a keyword that matches no template', async () => {
      expect(await codesOf('?search=zzz')).toEqual([]);
    });
  });

  describe('locks', () => {
    it('reads the items under a shared lock when it creates and when it replaces panels', async () => {
      const { id } = bodyOf(await create(MANAGER));
      expect(itemQuery).toHaveBeenCalledWith(
        expect.stringContaining('FOR SHARE'),
        [[LIVE_ITEM, OTHER_LIVE_ITEM]],
      );

      itemQuery.mockClear();
      await request(server())
        .patch(`${BASE}/${id}`)
        .set(as(MANAGER))
        .send({
          panels: [
            {
              tag: 'X',
              quantity: 1,
              lines: [{ itemId: LIVE_ITEM, quantity: 1 }],
            },
          ],
        });
      expect(itemQuery).toHaveBeenCalledWith(
        expect.stringContaining('FOR SHARE'),
        [[LIVE_ITEM]],
      );
    });

    it('locks the template row for update and for a state change', async () => {
      const { id } = bodyOf(await create(MANAGER));
      const locked = {
        where: { id, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      };

      templates.findOne.mockClear();
      await request(server())
        .patch(`${BASE}/${id}`)
        .set(as(MANAGER))
        .send({ name: 'Locked' });
      expect(templates.findOne).toHaveBeenCalledWith(locked);

      templates.findOne.mockClear();
      await request(server()).post(`${BASE}/${id}/deactivate`).set(as(MANAGER));
      expect(templates.findOne).toHaveBeenCalledWith(locked);
    });
  });

  describe('not found', () => {
    it('answers 404 to deleting or toggling a template that does not exist', async () => {
      expect(
        (await request(server()).delete(`${BASE}/999`).set(as(MANAGER))).status,
      ).toBe(404);
      expect(
        (
          await request(server())
            .post(`${BASE}/999/deactivate`)
            .set(as(MANAGER))
        ).status,
      ).toBe(404);
    });
  });
});
