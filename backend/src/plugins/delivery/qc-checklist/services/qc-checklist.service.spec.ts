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

import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';
import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import { QcChecklistController } from '@plugins/delivery/qc-checklist/qc-checklist.controller';
import { QcChecklistService } from '@plugins/delivery/qc-checklist/services/qc-checklist.service';

import type { App } from 'supertest/types';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

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

const ACTORS = {
  manager: { username: 'production_manager', role: 'productionManager' },
  inspector: { username: 'qc_a', role: 'qcInspector' },
  storekeeper: { username: 'storekeeper', role: 'storekeeper' },
} as const;
type ActorName = keyof typeof ACTORS;

interface ItemBody {
  id: number;
  name: string;
  position: number;
  active: boolean;
}

const NAME_PREFIX = 'Spec QC ';
const LOCK_SQL = `SELECT pg_advisory_xact_lock(hashtext('qc_checklist'))`;

/**
 * The template routes over HTTP against the real Postgres of the compose stack. The rows these
 * specs add carry a prefix and are removed afterwards; the template itself is only ever
 * reordered temporarily and put back.
 */
describeWithDatabase('QcChecklistService (real Postgres)', () => {
  jest.setTimeout(60_000);

  let dataSource: DataSource;
  let app: INestApplication<App>;
  const tokens = {} as Record<ActorName, string>;
  let counter = 0;

  const uniqueName = (label: string) =>
    `${NAME_PREFIX}${label} ${Date.now()}-${counter++}`;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [],
      extra: { max: 15 },
    });
    try {
      await dataSource.initialize();
    } catch (error: unknown) {
      throw new Error(
        `Postgres is unreachable (${error instanceof Error ? error.message : String(error)}). Run inside the compose backend container, or set SKIP_DB_SPECS=1 to skip these checks.`,
      );
    }
    for (const [name, spec] of Object.entries(ACTORS)) {
      const [user]: Array<{ id: number }> = await dataSource.query(
        `SELECT id FROM users WHERE username = $1`,
        [spec.username],
      );
      tokens[name as ActorName] = JSON.stringify({
        userId: user.id,
        role: spec.role,
        permissions: seededRolePermissions(spec.role) ?? [],
      });
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [QcChecklistController],
      providers: [
        QcChecklistService,
        { provide: DataSource, useValue: dataSource },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    // Under the template lock like every other write, so a QC round of another suite never
    // reads an item that is deleted before its snapshot is written.
    await dataSource.transaction(async (manager) => {
      await manager.query(LOCK_SQL);
      await manager.query(`DELETE FROM qc_checklist_items WHERE name LIKE $1`, [
        `${NAME_PREFIX}%`,
      ]);
    });
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
  });

  const http = (as: ActorName) => ({ 'x-test-actor': tokens[as] });
  const list = (as: ActorName = 'manager', includeHidden = true) =>
    request(app.getHttpServer())
      .get(`/delivery/qc/checklist-items?includeHidden=${includeHidden}`)
      .set(http(as));
  const add = (name: string, as: ActorName = 'manager') =>
    request(app.getHttpServer())
      .post('/delivery/qc/checklist-items')
      .set(http(as))
      .send({ name });
  const patch = (id: number, body: object, as: ActorName = 'manager') =>
    request(app.getHttpServer())
      .patch(`/delivery/qc/checklist-items/${id}`)
      .set(http(as))
      .send(body);
  const reorder = (ids: number[], as: ActorName = 'manager') =>
    request(app.getHttpServer())
      .put('/delivery/qc/checklist-items/order')
      .set(http(as))
      .send({ ids });
  const itemsOf = async (includeHidden = true) =>
    (await list('manager', includeHidden).expect(200)).body as ItemBody[];

  it('appends an added item after the last position', async () => {
    const before = await itemsOf();
    const maxPosition = Math.max(0, ...before.map((item) => item.position));
    const name = uniqueName('append');

    const res = await add(name).expect(201);

    expect(res.body).toMatchObject({
      name,
      position: maxPosition + 1,
      active: true,
    });
    const after = await itemsOf();
    expect(after.map((item) => item.position)).toEqual(
      [...after.map((item) => item.position)].sort((a, b) => a - b),
    );
    expect(after[after.length - 1].name).toBe(name);
  });

  it('trims the name and refuses a blank or an overlong one', async () => {
    const name = uniqueName('trim');
    const res = await add(`  ${name}  `).expect(201);
    expect(res.body).toMatchObject({ name });

    await add('   ').expect(400);
    await add('x'.repeat(201)).expect(400);
  });

  it('answers 409 for a name that exists in any case, on add and on rename', async () => {
    const name = uniqueName('dup');
    const first = (await add(name).expect(201)).body as ItemBody;

    await add(name.toUpperCase()).expect(409);
    const other = (await add(uniqueName('other')).expect(201)).body as ItemBody;
    await patch(other.id, { name: name.toLowerCase() }).expect(409);

    await patch(first.id, { name: name.toUpperCase() }).expect(200);
  });

  it('keeps a hidden item as a row and lists it only with includeHidden', async () => {
    const created = (await add(uniqueName('hide')).expect(201))
      .body as ItemBody;

    const hidden = await patch(created.id, { active: false }).expect(200);
    expect(hidden.body).toMatchObject({ id: created.id, active: false });

    expect((await itemsOf(false)).some((item) => item.id === created.id)).toBe(
      false,
    );
    const all = await itemsOf(true);
    expect(all.find((item) => item.id === created.id)).toMatchObject({
      active: false,
      position: created.position,
    });
    const [row]: Array<{ active: boolean; is_deleted: boolean }> =
      await dataSource.query(
        `SELECT active, is_deleted FROM qc_checklist_items WHERE id = $1`,
        [created.id],
      );
    expect(row).toEqual({ active: false, is_deleted: false });

    await patch(created.id, { active: true }).expect(200);
    expect((await itemsOf(false)).some((item) => item.id === created.id)).toBe(
      true,
    );
  });

  it('answers 404 for an unknown item and 400 for an empty change', async () => {
    await patch(2000000000, { active: false }).expect(404);
    const created = (await add(uniqueName('empty')).expect(201))
      .body as ItemBody;
    await patch(created.id, {}).expect(400);
  });

  describe('reorder', () => {
    it('answers 400 for a missing, a foreign or a repeated id and changes nothing', async () => {
      const before = await itemsOf();
      const ids = before.map((item) => item.id);

      await reorder(ids.slice(1)).expect(400);
      await reorder([...ids, 2000000000]).expect(400);
      await reorder([...ids.slice(1), ids[1]]).expect(400);
      await reorder([]).expect(400);

      expect(await itemsOf()).toEqual(before);
    });

    it('rewrites the positions 1..n in the order given', async () => {
      const before = await itemsOf();
      const ids = before.map((item) => item.id);
      try {
        const reversed = [...ids].reverse();
        const res = await reorder(reversed).expect(200);

        const after = await itemsOf();
        expect(after.map((item) => item.id)).toEqual(reversed);
        expect(after.map((item) => item.position)).toEqual(
          reversed.map((_, index) => index + 1),
        );
        expect((res.body as ItemBody[]).map((item) => item.id)).toEqual(
          reversed,
        );
      } finally {
        await reorder(ids).expect(200);
      }
      expect((await itemsOf()).map((item) => item.id)).toEqual(ids);
    });
  });

  it('gives two adds queued behind the template lock distinct consecutive positions', async () => {
    const before = await itemsOf();
    const maxPosition = Math.max(0, ...before.map((item) => item.position));

    const results = await queuedBehind(
      dataSource,
      LOCK_SQL,
      [],
      [
        () => add(uniqueName('race-a')).then((res) => res),
        () => add(uniqueName('race-b')).then((res) => res),
      ],
    );

    const bodies = results.map((result) => {
      if (result.status !== 'fulfilled') throw result.reason;
      expect(result.value.status).toBe(201);
      return result.value.body as ItemBody;
    });
    expect(bodies.map((body) => body.position)).toEqual([
      maxPosition + 1,
      maxPosition + 2,
    ]);
  });

  it('serialises a rename behind the template lock too', async () => {
    const created = (await add(uniqueName('lock')).expect(201))
      .body as ItemBody;
    const renamed = uniqueName('lock-renamed');

    const results = await queuedBehind(
      dataSource,
      LOCK_SQL,
      [],
      [() => patch(created.id, { name: renamed }).then((res) => res)],
    );

    expect(results[0].status).toBe('fulfilled');
    expect((await itemsOf()).find((item) => item.id === created.id)?.name).toBe(
      renamed,
    );
  });

  describe('who may use the template', () => {
    it('refuses a storekeeper every route with 403', async () => {
      const created = (await add(uniqueName('guard')).expect(201))
        .body as ItemBody;
      const before = await itemsOf();

      await list('storekeeper').expect(403);
      await add(uniqueName('denied'), 'storekeeper').expect(403);
      await patch(created.id, { active: false }, 'storekeeper').expect(403);
      await reorder(
        before.map((item) => item.id),
        'storekeeper',
      ).expect(403);

      expect(await itemsOf()).toEqual(before);
    });

    it('lets a qcInspector read but not write', async () => {
      const created = (await add(uniqueName('readonly')).expect(201))
        .body as ItemBody;

      const read = await list('inspector', false).expect(200);
      expect((read.body as ItemBody[]).some((i) => i.id === created.id)).toBe(
        true,
      );
      await add(uniqueName('denied'), 'inspector').expect(403);
      await patch(created.id, { name: uniqueName('x') }, 'inspector').expect(
        403,
      );
      await reorder([created.id], 'inspector').expect(403);
    });
  });
});
