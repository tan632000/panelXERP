import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';
import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import {
  openInstallationHarness,
  type InstallationHarness,
} from '@plugins/delivery/installation/installation-db.helper-spec';
import { describeWithDatabase } from '@plugins/production/production-order/production-db.helper-spec';

interface InstallationBody {
  id: number;
  orderId: number;
  status: string;
  siteAddress: string | null;
  plannedDate: string | null;
  personInCharge: string | null;
  note: string | null;
  startedAt: string | null;
  doneAt: string | null;
}

/**
 * The installation at the project against the real Postgres of the compose stack: one per order,
 * the address prefill, forward-only moves, the order status re-checked by every write, and the
 * scope of every route.
 */
describeWithDatabase('InstallationService (real Postgres)', () => {
  jest.setTimeout(180_000);

  let d: InstallationHarness;

  beforeAll(async () => {
    d = await openInstallationHarness();
  });

  afterAll(async () => {
    await d?.close();
  });

  const body = (res: { body: unknown }) => res.body as InstallationBody;

  describe('create', () => {
    it('prefills the project site address, then the customer address, and keeps an explicit one', async () => {
      const withProject = await d.orderIn('in_production');
      await d.setAddresses(withProject, {
        customer: 'Kho khách, Hà Nội',
        project: 'Công trường A, Đà Nẵng',
      });
      const customerOnly = await d.orderIn('in_production');
      await d.setAddresses(customerOnly, { customer: 'Kho khách, Hà Nội' });
      const explicit = await d.orderIn('in_production');
      await d.setAddresses(explicit, { project: 'Công trường A, Đà Nẵng' });
      const nowhere = await d.orderIn('in_production');

      const a = body(await d.create(withProject).expect(201));
      const b = body(await d.create(customerOnly).expect(201));
      const c = body(
        await d
          .create(explicit, {
            siteAddress: '  Tầng 3, toà B  ',
            plannedDate: '2031-01-15',
            personInCharge: 'Đội lắp đặt số 2',
            note: 'Cần xe nâng',
          })
          .expect(201),
      );
      const e = body(await d.create(nowhere).expect(201));

      expect(a.siteAddress).toBe('Công trường A, Đà Nẵng');
      expect(b.siteAddress).toBe('Kho khách, Hà Nội');
      expect(c).toMatchObject({
        siteAddress: 'Tầng 3, toà B',
        plannedDate: '2031-01-15',
        personInCharge: 'Đội lắp đặt số 2',
        note: 'Cần xe nâng',
        status: 'planned',
      });
      expect(e.siteAddress).toBeNull();
    });

    it('allows one installation per order: a second create answers 409', async () => {
      const { orderId } = await d.planned();

      await d.create(orderId).expect(409);

      const [row]: Array<{ n: string }> = await d.h.dataSource.query(
        `SELECT COUNT(*) AS n FROM installations WHERE order_id = $1`,
        [orderId],
      );
      expect(Number(row.n)).toBe(1);
    });

    it('lets exactly one of two creates racing for one order win', async () => {
      const orderId = await d.orderIn('in_production');
      const create = async () => (await d.create(orderId)).status;

      const outcomes = await queuedBehind(
        d.h.dataSource,
        `SELECT id FROM sales_orders WHERE id = $1 FOR UPDATE`,
        [orderId],
        [create, create],
      );

      expect(
        outcomes.map((o) => (o.status === 'fulfilled' ? o.value : -1)),
      ).toEqual([201, 409]);
    });

    it('backs the rule with a unique index among the live rows', async () => {
      const { orderId } = await d.planned();

      await expect(
        d.h.dataSource.query(
          `INSERT INTO installations (order_id) VALUES ($1)`,
          [orderId],
        ),
      ).rejects.toMatchObject({
        driverError: { constraint: 'uq_installations_order' },
      });
    });

    it('creates while the order is delivered, and refuses an open, a completed and a cancelled order', async () => {
      await d.create(await d.orderIn('delivered')).expect(201);

      for (const status of ['open', 'completed', 'cancelled']) {
        await d.create(await d.orderIn(status)).expect(409);
      }
    });

    it('answers 404 to an order that does not exist and refuses an over-long text', async () => {
      await d.create(2147483000).expect(404);
      const orderId = await d.orderIn('in_production');

      await d.create(orderId, { siteAddress: 'x'.repeat(501) }).expect(400);
      await d.create(orderId, { personInCharge: 'x'.repeat(256) }).expect(400);
      await d.create(orderId, { note: 'x'.repeat(2001) }).expect(400);
      await d.create(orderId, { plannedDate: 'tomorrow' }).expect(400);
    });
  });

  describe('moves', () => {
    it('moves planned → in_progress → done and refuses every other move', async () => {
      const { id } = await d.planned();

      await d.finish(id).expect(409);
      const started = body(await d.start(id).expect(200));
      expect(started.status).toBe('in_progress');
      expect(started.startedAt).not.toBeNull();
      await d.start(id).expect(409);
      const finished = body(await d.finish(id).expect(200));
      expect(finished.status).toBe('done');
      expect(finished.doneAt).not.toBeNull();
      await d.finish(id).expect(409);
      await d.start(id).expect(409);
      expect(await d.statusOf(id)).toBe('done');
    });

    it('moves while the order is delivered', async () => {
      const { id, orderId } = await d.planned();
      await d.setOrderStatus(orderId, 'delivered');

      await d.start(id).expect(200);
      await d.finish(id).expect(200);
    });
  });

  describe('edit', () => {
    it('changes the given fields, clears a field given empty and leaves the others', async () => {
      const { id } = await d.planned();

      await d
        .patch(id, {
          siteAddress: 'Tầng 3',
          personInCharge: 'An',
          note: 'Ghi chú',
          plannedDate: '2031-02-01',
        })
        .expect(200);
      const res = body(
        await d.patch(id, { note: '', personInCharge: 'Bình' }).expect(200),
      );

      expect(res).toMatchObject({
        siteAddress: 'Tầng 3',
        personInCharge: 'Bình',
        note: null,
        plannedDate: '2031-02-01',
        status: 'planned',
      });
      await d.patch(id, { note: 'x'.repeat(2001) }).expect(400);
    });

    it('edits while in progress and refuses an edit once done', async () => {
      const { id } = await d.planned();
      await d.start(id).expect(200);
      await d.patch(id, { note: 'Đang lắp' }).expect(200);
      await d.finish(id).expect(200);

      await d.patch(id, { note: 'Sửa sau khi xong' }).expect(409);

      const res = await d.get(`/delivery/installations/${id}`).expect(200);
      expect(body(res).note).toBe('Đang lắp');
    });
  });

  describe('the order status is checked again by every write', () => {
    const writes = {
      start: (id: number) => d.start(id),
      finish: (id: number) => d.finish(id),
      patch: (id: number) => d.patch(id, { note: 'Muộn' }),
    };
    it.each([
      ['start', 'planned'],
      ['finish', 'in_progress'],
      ['patch', 'planned'],
    ] as const)(
      'refuses %s on an installation whose order was cancelled meanwhile',
      async (write, before) => {
        const { id, orderId } = await d.planned();
        if (before === 'in_progress') await d.start(id).expect(200);
        await d.setOrderStatus(orderId, 'cancelled');

        await writes[write](id).expect(409);

        expect(await d.statusOf(id)).toBe(before);
      },
    );
  });

  describe('scope', () => {
    it('lets the order owner and the managers read, and refuses the owner every write', async () => {
      const { id, orderId } = await d.planned();

      const one = await d
        .get(`/delivery/installations/${id}`, 'salesA')
        .expect(200);
      const list = await d
        .get(`/delivery/installations?orderId=${orderId}`, 'salesA')
        .expect(200);
      await d.get(`/delivery/installations/${id}`, 'salesMgr').expect(200);
      await d.get(`/delivery/installations/${id}`, 'manager').expect(200);

      expect(body(one).id).toBe(id);
      expect((list.body as { data: unknown[] }).data).toHaveLength(1);
      await d.create(orderId, {}, 'salesA').expect(403);
      await d.patch(id, { note: 'x' }, 'salesA').expect(403);
      await d.start(id, 'salesA').expect(403);
      await d.finish(id, 'salesA').expect(403);
    });

    it('answers 404 to another sales rep on every route, even with the manage permission and before any 409', async () => {
      const { id, orderId } = await d.planned();
      await d.start(id).expect(200);
      await d.setOrderStatus(orderId, 'cancelled');
      const free = await d.orderIn('open');

      await d.get(`/delivery/installations/${id}`, 'salesB').expect(404);
      const list = await d
        .get(`/delivery/installations?orderId=${orderId}`, 'salesB')
        .expect(200);
      expect((list.body as { data: unknown[] }).data).toEqual([]);
      await d.withGrant('salesB', 'installation:manage', async () => {
        // The order is cancelled and the installation started: a 409 would leak their existence.
        await d.patch(id, { note: 'x' }, 'salesB').expect(404);
        await d.start(id, 'salesB').expect(404);
        await d.finish(id, 'salesB').expect(404);
        await d.create(orderId, {}, 'salesB').expect(404);
        await d.create(free, {}, 'salesB').expect(404);
      });
      expect(await d.statusOf(id)).toBe('in_progress');
    });

    it('lets no technician or QC inspector in', async () => {
      const { id } = await d.planned();

      await d.get(`/delivery/installations/${id}`, 'techA').expect(403);
      await d.get(`/delivery/installations/${id}`, 'qcInspector').expect(403);
      await d.start(id, 'qcInspector').expect(403);
    });
  });

  describe('lists', () => {
    it('filters by status and order, pages the answer and carries no money key', async () => {
      const first = await d.planned();
      const second = await d.planned();
      await d.start(second.id).expect(200);

      const planned = await d
        .get('/delivery/installations?status=planned&limit=100')
        .expect(200);
      const forOrder = await d
        .get(`/delivery/installations?orderId=${second.orderId}`)
        .expect(200);
      const paged = await d
        .get('/delivery/installations?limit=1&page=1')
        .expect(200);
      await d.get('/delivery/installations?status=cancelled').expect(400);

      const ids = (planned.body as { data: Array<{ id: number }> }).data.map(
        (row) => row.id,
      );
      expect(ids).toContain(first.id);
      expect(ids).not.toContain(second.id);
      expect(
        (forOrder.body as { data: Array<{ id: number }> }).data.map(
          (row) => row.id,
        ),
      ).toEqual([second.id]);
      expect((paged.body as { data: unknown[] }).data).toHaveLength(1);
      expectNoMoneyKeys(planned.body);
      expectNoMoneyKeys(forOrder.body);
    });

    it('carries no money key in the installation, its moves or its photos', async () => {
      const { id, orderId } = await d.planned();
      await d.upload(id).expect(201);

      expectNoMoneyKeys(
        (await d.create(await d.orderIn('delivered')).expect(201)).body,
      );
      expectNoMoneyKeys(
        (await d.get(`/delivery/installations/${id}`).expect(200)).body,
      );
      expectNoMoneyKeys((await d.start(id).expect(200)).body);
      expectNoMoneyKeys((await d.finish(id).expect(200)).body);
      expectNoMoneyKeys(
        (
          await d
            .get(`/delivery/installations?orderId=${orderId}`, 'salesMgr')
            .expect(200)
        ).body,
      );
    });
  });
});
