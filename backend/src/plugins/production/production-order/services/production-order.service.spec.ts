import { ConflictException } from '@nestjs/common';

import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import { DataScopeService } from '@shared/services/data-scope.service';

import {
  describeWithDatabase,
  openProductionHarness,
  type ProductionHarness,
} from '@plugins/production/production-order/production-db.helper-spec';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { SalesOrder } from '@plugins/sales/order/entities/order.entity';
import { OrderEditService } from '@plugins/sales/order/services/order-edit.service';
import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

interface UnitBody {
  id: number;
  code: string;
  assigneeId: number | null;
  plannedEndDate: string | null;
}
interface DetailBody {
  id: number;
  code: string;
  status: string;
  orderId: number;
  units: UnitBody[];
  events: Array<{ event: string; unitCode: string | null }>;
}
interface PageBody {
  data: Array<{ id: number; status: string; unitCount: number }>;
  meta: { total: number };
}
const detail = (res: { body: unknown }) => res.body as DetailBody;

/**
 * Production orders over HTTP against the real Postgres of the compose stack: the cabinets a
 * create makes, the guards, the order-cancel veto through the real order cancel, release and
 * cancel moving the order, the data scope of every read, and the notices each decision sends.
 */
describeWithDatabase('Production orders (real Postgres)', () => {
  jest.setTimeout(60_000);

  let h: ProductionHarness;
  let editor: OrderEditService;

  beforeAll(async () => {
    h = await openProductionHarness([
      SalesRequest,
      SalesRequestActivity,
      SalesOrder,
    ]);
    // The real order cancel on the shared lifecycle registry; only the final re-read of the
    // order detail, which needs the whole sales module, is stubbed.
    editor = new OrderEditService(
      h.dataSource,
      new DataScopeService(),
      { findOne: () => Promise.resolve({}) } as never,
      new RequestStatusPort(),
      h.lifecycle,
    );
  });

  afterAll(async () => {
    await h?.close();
  });

  const cancelOrder = (orderId: number) =>
    editor.cancel(orderId, { reason: 'Customer left' }, h.actors.salesMgr);

  const draftFor = async (
    spec: Parameters<ProductionHarness['newOrder']>[0] = {},
  ) => {
    const orderId = await h.newOrder(spec);
    const created = await h.createProduction(orderId).expect(201);
    return { orderId, id: detail(created).id, created: detail(created) };
  };

  it('makes one cabinet per panel ordered and six pending stages for each', async () => {
    const orderId = await h.newOrder({
      panels: [
        { tag: 'MSB', quantity: 3 },
        { tag: 'DB1', quantity: 1 },
      ],
    });
    const res = await h.createProduction(orderId).expect(201);
    const created = detail(res);

    expect(created.code).toMatch(/^LSX_\d{4}_\d{4}$/);
    expect(created.status).toBe('draft');
    expect(created.units.map((unit) => unit.code)).toEqual([
      'MSB-1',
      'MSB-2',
      'MSB-3',
      'DB1-1',
    ]);
    expect(created.units.every((unit) => unit.assigneeId === null)).toBe(true);
    const stages: Array<{ status: string; n: string }> =
      await h.dataSource.query(
        `SELECT s.status, COUNT(*) AS n
         FROM production_unit_stages s
         JOIN production_units u ON u.id = s.unit_id
        WHERE u.production_order_id = $1 GROUP BY s.status`,
        [created.id],
      );
    expect(stages).toEqual([{ status: 'pending', n: '24' }]);
    const sequence: Array<{ stages: string[] }> = await h.dataSource.query(
      `SELECT array_agg(s.stage::text ORDER BY s.seq) AS stages
         FROM production_unit_stages s WHERE s.unit_id = $1`,
      [created.units[0].id],
    );
    expect(sequence[0].stages).toEqual([
      'material_prep',
      'enclosure',
      'device_mounting',
      'wiring',
      'internal_test',
      'finishing',
    ]);
    expect(created.events.map((entry) => entry.event)).toEqual(['created']);
  });

  it('numbers two lines that share a tag without repeating a code', async () => {
    const orderId = await h.newOrder({
      panels: [
        { tag: 'MSB', quantity: 1 },
        { tag: 'MSB', quantity: 2 },
      ],
    });
    const res = await h.createProduction(orderId).expect(201);
    expect(detail(res).units.map((unit) => unit.code)).toEqual([
      'MSB-1',
      'MSB-2',
      'MSB-3',
    ]);
  });

  it('refuses a cancelled order and a second production order, and allows one after a cancel', async () => {
    const gone = await h.newOrder({ status: 'cancelled' });
    await h.createProduction(gone).expect(409);
    await h.createProduction(2147483000).expect(404);

    const orderId = await h.newOrder();
    const first = detail(await h.createProduction(orderId).expect(201));
    await h.createProduction(orderId).expect(409);

    await h
      .post(`/production/orders/${first.id}/cancel`, { reason: 'Wrong panels' })
      .expect(200);
    const second = detail(await h.createProduction(orderId).expect(201));
    expect(second.id).not.toBe(first.id);
    expect(await h.statusOfProduction(first.id)).toBe('cancelled');
  });

  it('keeps an order with a production order from being cancelled, through the real order cancel', async () => {
    const { orderId, id } = await draftFor({
      panels: [{ tag: 'MSB', quantity: 2 }],
    });

    // A draft already blocks the cancel, and the order stays open.
    await expect(cancelOrder(orderId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await h.statusOfOrder(orderId)).toBe('open');

    // A cabinet without a technician or a date refuses the release, naming the codes.
    const [first, second] = await h.units(id);
    await h
      .assign(id, first.id, {
        assigneeId: h.actors.techA.userId,
        plannedEndDate: '2031-12-31',
      })
      .expect(200);
    await h
      .assign(id, second.id, { assigneeId: h.actors.techA.userId })
      .expect(200);
    const refused = await h
      .post(`/production/orders/${id}/release`, {})
      .expect(400);
    expect((refused.body as { message: string }).message).toContain(
      second.code,
    );
    expect((refused.body as { message: string }).message).not.toContain(
      first.code,
    );
    expect(await h.statusOfOrder(orderId)).toBe('open');
    expect(await h.statusOfProduction(id)).toBe('draft');

    await h.assign(id, second.id, { plannedEndDate: '2031-12-31' }).expect(200);
    const released = await h
      .post(`/production/orders/${id}/release`, {})
      .expect(200);
    expect(detail(released).status).toBe('released');
    expect(await h.statusOfOrder(orderId)).toBe('in_production');

    await expect(cancelOrder(orderId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await h.statusOfOrder(orderId)).toBe('in_production');

    // Cancelling the production order gives the order back; only then may it be cancelled.
    await h
      .post(`/production/orders/${id}/cancel`, { reason: 'Redesign' })
      .expect(200);
    expect(await h.statusOfOrder(orderId)).toBe('open');
    await h.post(`/production/orders/${id}/release`, {}).expect(409);
    await cancelOrder(orderId);
    expect(await h.statusOfOrder(orderId)).toBe('cancelled');
  });

  it('assigns only technicians, and refuses changes once the order is over or the cabinet finished', async () => {
    const { id } = await draftFor({ panels: [{ tag: 'MSB', quantity: 2 }] });
    const [first, second] = await h.units(id);

    await h
      .assign(id, first.id, { assigneeId: h.actors.storekeeper.userId })
      .expect(400);
    await h.assign(id, first.id, { assigneeId: 2147483000 }).expect(400);
    await h
      .assign(id, first.id, { assigneeId: h.actors.techB.userId })
      .expect(200);
    await h
      .assign(id, 2147483000, { assigneeId: h.actors.techA.userId })
      .expect(404);
    await h.assign(id, first.id, { plannedEndDate: 'tomorrow' }).expect(400);

    // A finished cabinet keeps its technician.
    await h.dataSource.query(
      `UPDATE production_unit_stages SET status = 'done' WHERE unit_id = $1 AND stage = 'finishing'`,
      [second.id],
    );
    await h
      .assign(id, second.id, { assigneeId: h.actors.techA.userId })
      .expect(409);

    await h
      .post(`/production/orders/${id}/cancel`, { reason: 'Stop' })
      .expect(200);
    await h
      .assign(id, first.id, { assigneeId: h.actors.techA.userId })
      .expect(409);
    await h
      .post(`/production/orders/${id}/cancel`, { reason: 'Again' })
      .expect(409);
    await h
      .post(`/production/orders/${id}/cancel`, { reason: ' ' })
      .expect(400);

    await h.dataSource.query(
      `UPDATE production_orders SET status = 'completed' WHERE id = $1`,
      [id],
    );
    await h
      .assign(id, first.id, { assigneeId: h.actors.techA.userId })
      .expect(409);
  });

  it('serves each actor only what the data scope reaches', async () => {
    const { orderId, id } = await draftFor({
      panels: [{ tag: 'MSB', quantity: 2 }],
    });
    const [first, second] = await h.units(id);

    // Roles without the permission, and a technician outside the order.
    await h.createProduction(orderId, 'storekeeper').expect(403);
    await h.get(`/production/orders/${id}`, 'storekeeper').expect(403);
    await h.createProduction(orderId, 'salesA').expect(403);

    await h
      .assign(id, first.id, {
        assigneeId: h.actors.techA.userId,
        plannedEndDate: '2031-12-31',
      })
      .expect(200);
    await h
      .assign(id, second.id, {
        assigneeId: h.actors.techB.userId,
        plannedEndDate: '2031-12-31',
      })
      .expect(200);

    // Sales: the owner of the order only.
    const own = await h.get(`/production/orders/${id}`, 'salesA').expect(200);
    expect(detail(own).units).toHaveLength(2);
    await h.get(`/production/orders/${id}`, 'salesB').expect(404);
    const ownList = await h
      .get(`/production/orders?orderId=${orderId}`, 'salesA')
      .expect(200);
    expect((ownList.body as PageBody).meta.total).toBe(1);
    const otherList = await h
      .get(`/production/orders?orderId=${orderId}`, 'salesB')
      .expect(200);
    expect((otherList.body as PageBody).data).toEqual([]);

    // The customer's owner changes: the former owner loses the order at once.
    await h.dataSource.query(
      `UPDATE sales_requests SET sales_owner_id = $2
        WHERE id = (SELECT request_id FROM sales_orders WHERE id = $1)`,
      [orderId, h.actors.salesB.userId],
    );
    await h.get(`/production/orders/${id}`, 'salesA').expect(404);
    await h.get(`/production/orders/${id}`, 'salesB').expect(200);

    // A technician sees the order, and inside it only their own cabinets.
    const mineA = detail(
      await h.get(`/production/orders/${id}`, 'techA').expect(200),
    );
    expect(mineA.units.map((unit) => unit.code)).toEqual([first.code]);
    expect(mineA.events).toEqual([]);
    const mineB = detail(
      await h.get(`/production/orders/${id}`, 'techB').expect(200),
    );
    expect(mineB.units.map((unit) => unit.code)).toEqual([second.code]);
    const listB = await h
      .get(`/production/orders?orderId=${orderId}`, 'techB')
      .expect(200);
    expect((listB.body as PageBody).data).toMatchObject([{ id, unitCount: 1 }]);
    const manager = await h
      .get(`/production/orders?orderId=${orderId}`)
      .expect(200);
    expect((manager.body as PageBody).data).toMatchObject([
      { id, unitCount: 2 },
    ]);

    // Reassigning the only cabinet of technician B takes the order away from them.
    await h
      .assign(id, second.id, { assigneeId: h.actors.techA.userId })
      .expect(200);
    await h.get(`/production/orders/${id}`, 'techB').expect(404);
    const emptyB = await h
      .get(`/production/orders?orderId=${orderId}`, 'techB')
      .expect(200);
    expect((emptyB.body as PageBody).data).toEqual([]);

    // No response carries a price.
    for (const as of ['manager', 'salesB', 'techA'] as const) {
      expectNoMoneyKeys((await h.get(`/production/orders/${id}`, as)).body);
      expectNoMoneyKeys((await h.get('/production/orders', as)).body);
    }
  });

  it('lists the open orders still without production and the technicians to assign', async () => {
    const free = await h.newOrder();
    const taken = await h.newOrder();
    await h.createProduction(taken).expect(201);

    const picker = await h.get(`/production/open-orders?limit=100`).expect(200);
    const ids = (picker.body as Array<{ id: number }>).map((row) => row.id);
    expect(ids).toContain(free);
    expect(ids).not.toContain(taken);
    const row = (picker.body as Array<Record<string, unknown>>).find(
      (entry) => entry.id === free,
    );
    expect(Object.keys(row ?? {}).sort()).toEqual([
      'code',
      'customerName',
      'deliveryDate',
      'id',
    ]);
    expectNoMoneyKeys(picker.body);
    await h.get('/production/open-orders', 'salesA').expect(403);

    const options = await h.get('/production/technician-options').expect(200);
    const names = options.body as Array<{ id: number; name: string }>;
    expect(names.map((option) => option.id)).toEqual(
      expect.arrayContaining([h.actors.techA.userId, h.actors.techB.userId]),
    );
    expect(names.map((option) => option.id)).not.toContain(
      h.actors.storekeeper.userId,
    );
    expect(Object.keys(names[0]).sort()).toEqual(['id', 'name']);
    await h.get('/production/technician-options', 'techA').expect(403);
  });

  it('tells each technician, the sales owner and a new assignee through their notification lists', async () => {
    const { orderId, id } = await draftFor({
      panels: [{ tag: 'MSB', quantity: 2 }],
    });
    await h.prepare(id, 'techA');
    // Nothing is announced while the order is a draft.
    expect(await h.notices('techA', orderId)).toEqual([]);

    await h.post(`/production/orders/${id}/release`, {}).expect(200);
    const types = async (as: Parameters<ProductionHarness['notices']>[0]) =>
      (await h.notices(as, orderId)).map((notice) => notice.eventType).sort();
    expect(await types('techA')).toEqual(['production.order.released']);
    expect(await types('salesA')).toEqual(['production.order.released.owner']);
    expect(await types('techB')).toEqual([]);
    expect(await types('salesB')).toEqual([]);
    expect(await types('storekeeper')).toEqual([]);

    // A cabinet handed to another technician tells only that technician.
    const [first] = await h.units(id);
    await h
      .assign(id, first.id, { assigneeId: h.actors.techB.userId })
      .expect(200);
    const assigned = (await h.notices('techB', orderId)).filter(
      (notice) => notice.eventType === 'production.unit.assigned',
    );
    expect(assigned).toHaveLength(1);
    expect(assigned[0].payload).toMatchObject({
      productionOrderId: id,
      unitCode: first.code,
    });
    expect(await types('techA')).toEqual(['production.order.released']);
    // A date change alone is not a new assignment.
    await h.assign(id, first.id, { plannedEndDate: '2032-01-15' }).expect(200);
    expect(
      (await h.notices('techB', orderId)).filter(
        (notice) => notice.eventType === 'production.unit.assigned',
      ),
    ).toHaveLength(1);

    await h
      .post(`/production/orders/${id}/cancel`, { reason: 'Redesign' })
      .expect(200);
    expect(await types('techA')).toEqual([
      'production.order.cancelled',
      'production.order.released',
    ]);
    expect(await types('salesA')).toEqual([
      'production.order.cancelled.owner',
      'production.order.released.owner',
    ]);
    const owner = (await h.notices('salesA', orderId)).find(
      (notice) => notice.eventType === 'production.order.cancelled.owner',
    );
    expect(owner?.payload).toMatchObject({ orderId, reason: 'Redesign' });

    // The list finds the order's production orders by sales order.
    const found = await h
      .get(`/production/orders?orderId=${orderId}`)
      .expect(200);
    expect((found.body as PageBody).data).toMatchObject([
      { id, status: 'cancelled' },
    ]);
  });

  it('finds the live production order of a sales order next to a cancelled one', async () => {
    const orderId = await h.newOrder();
    const first = detail(await h.createProduction(orderId).expect(201));
    await h
      .post(`/production/orders/${first.id}/cancel`, { reason: 'Redo' })
      .expect(200);
    const second = detail(await h.createProduction(orderId).expect(201));

    const all = await h
      .get(`/production/orders?orderId=${orderId}`)
      .expect(200);
    expect((all.body as PageBody).data.map((row) => row.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    const live = await h
      .get(`/production/orders?orderId=${orderId}&status=draft`)
      .expect(200);
    expect((live.body as PageBody).data.map((row) => row.id)).toEqual([
      second.id,
    ]);
  });
});
