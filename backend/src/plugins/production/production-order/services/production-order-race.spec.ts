import { randomBytes } from 'crypto';

import { ConflictException } from '@nestjs/common';

import { queuedBehind } from '@kernel/shared/testing/queued-behind.helper-spec';

import { DataScopeService } from '@shared/services/data-scope.service';

import {
  describeWithDatabase,
  openProductionHarness,
  type ProductionHarness,
} from '@plugins/production/production-order/production-db.helper-spec';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { OrderFollowerNotifier } from '@plugins/sales/_shared/services/order-follower-notifier';
import { SalesOrder } from '@plugins/sales/order/entities/order.entity';
import { OrderEditService } from '@plugins/sales/order/services/order-edit.service';
import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

import type { Response } from 'supertest';

const ORDER_LOCK = `SELECT id FROM sales_orders WHERE id = $1 FOR UPDATE`;
const HEADER_LOCK = `SELECT id FROM production_orders WHERE id = $1 FOR UPDATE`;

/**
 * Production decisions racing each other and an order cancel on the real Postgres of the
 * compose stack. Each race holds a row lock in a transaction of its own until every contender
 * is queued behind it, so the contenders really overlap (each is past everything it does
 * before that lock) and run in the order they queued.
 */
describeWithDatabase('Production order races (real Postgres)', () => {
  jest.setTimeout(60_000);

  let h: ProductionHarness;
  let editor: OrderEditService;

  beforeAll(async () => {
    h = await openProductionHarness([
      SalesRequest,
      SalesRequestActivity,
      SalesOrder,
    ]);
    editor = new OrderEditService(
      h.dataSource,
      new DataScopeService(),
      { findOne: () => Promise.resolve({}) } as never,
      new RequestStatusPort(),
      h.lifecycle,
      h.app.get(OrderFollowerNotifier),
    );
  });

  afterAll(async () => {
    await h?.close();
  });

  const cancelOrder = (orderId: number) =>
    editor.cancel(orderId, { reason: 'Customer left' }, h.actors.salesMgr);
  const release = (id: number) => async () =>
    h.post(`/production/orders/${id}/release`, {});
  const statusOf = (result: PromiseSettledResult<Response>) =>
    result.status === 'fulfilled' ? result.value.status : 'rejected';

  /** A draft production order whose cabinets all have a technician and a date. */
  async function readyOrder(quantity = 1) {
    const orderId = await h.newOrder({
      panels: [{ tag: 'MSB', quantity }],
    });
    const created = await h.createProduction(orderId).expect(201);
    const id = (created.body as { id: number }).id;
    await h.prepare(id);
    return { orderId, id };
  }

  it('vetoes an order cancel queued ahead of a release, and the release then succeeds', async () => {
    const { orderId, id } = await readyOrder();

    const [cancel, released] = await queuedBehind<unknown>(
      h.dataSource,
      ORDER_LOCK,
      [orderId],
      [() => cancelOrder(orderId), release(id)],
    );

    expect(cancel.status).toBe('rejected');
    expect((cancel as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
    expect(statusOf(released as PromiseSettledResult<Response>)).toBe(200);
    expect(await h.statusOfOrder(orderId)).toBe('in_production');
    expect(await h.statusOfProduction(id)).toBe('released');
  });

  it('lets exactly one of a release and an order cancel win, whichever queues first', async () => {
    const { orderId, id } = await readyOrder();

    const [released, cancel] = await queuedBehind<unknown>(
      h.dataSource,
      ORDER_LOCK,
      [orderId],
      [release(id), () => cancelOrder(orderId)],
    );

    expect(statusOf(released as PromiseSettledResult<Response>)).toBe(200);
    expect(cancel.status).toBe('rejected');
    expect(await h.statusOfOrder(orderId)).toBe('in_production');
  });

  it('lets one of two releases through and refuses the other', async () => {
    const { orderId, id } = await readyOrder(2);

    const results = await queuedBehind<Response>(
      h.dataSource,
      HEADER_LOCK,
      [id],
      [release(id), release(id)],
    );

    expect(results.map(statusOf)).toEqual([200, 409]);
    expect(await h.statusOfOrder(orderId)).toBe('in_production');
  });

  it('runs an assignment queued behind a release on the released order, without a deadlock', async () => {
    const { orderId, id } = await readyOrder(2);
    const [first] = await h.units(id);

    const results = await queuedBehind<Response>(
      h.dataSource,
      HEADER_LOCK,
      [id],
      [
        release(id),
        async () =>
          h.assign(id, first.id, { assigneeId: h.actors.techB.userId }),
      ],
    );

    expect(results.map(statusOf)).toEqual([200, 200]);
    expect(await h.statusOfProduction(id)).toBe('released');
    // Only a released order tells a new technician: the change saw `released`.
    const assigned = (await h.notices('techB', orderId)).filter(
      (notice) => notice.eventType === 'production.unit.assigned',
    );
    expect(assigned).toHaveLength(1);
    const events: Array<{ event: string }> = await h.dataSource.query(
      `SELECT event FROM production_order_events WHERE production_order_id = $1 ORDER BY id`,
      [id],
    );
    expect(events.map((row) => row.event)).toEqual([
      'created',
      'unit_updated',
      'unit_updated',
      'released',
      'unit_updated',
    ]);
  });

  it('releases on the cabinet an assignment queued ahead of it changed', async () => {
    const { orderId, id } = await readyOrder();
    const [first] = await h.units(id);

    const results = await queuedBehind<Response>(
      h.dataSource,
      HEADER_LOCK,
      [id],
      [
        async () =>
          h.assign(id, first.id, { assigneeId: h.actors.techB.userId }),
        release(id),
      ],
    );

    expect(results.map(statusOf)).toEqual([200, 200]);
    // The release read the assignee the change committed, so it told technician B.
    expect(
      (await h.notices('techB', orderId)).map((notice) => notice.eventType),
    ).toEqual(['production.order.released']);
    expect(
      (await h.notices('techA', orderId)).map((notice) => notice.eventType),
    ).toEqual([]);
  });

  it('refuses an assignment queued behind a cancel of the production order', async () => {
    const { id } = await readyOrder();
    const [first] = await h.units(id);

    const results = await queuedBehind<Response>(
      h.dataSource,
      HEADER_LOCK,
      [id],
      [
        async () =>
          h.post(`/production/orders/${id}/cancel`, { reason: 'Stop' }),
        async () =>
          h.assign(id, first.id, { assigneeId: h.actors.techB.userId }),
      ],
    );

    expect(results.map(statusOf)).toEqual([200, 409]);
    const [unit]: Array<{ assignee_id: number }> = await h.dataSource.query(
      `SELECT assignee_id FROM production_units WHERE id = $1`,
      [first.id],
    );
    expect(unit.assignee_id).toBe(h.actors.techA.userId);
  });

  describe('the technician role of an assignee', () => {
    let spareId: number;

    /** A technician of its own, so removing the role cannot reach another spec's account. */
    beforeEach(async () => {
      const suffix = randomBytes(4).toString('hex');
      const [user]: Array<{ id: number }> = await h.dataSource.query(
        `INSERT INTO users (username, email, password_hash, full_name)
         VALUES ($1, $2, 'x', 'Spare technician') RETURNING id`,
        [`spare_${suffix}`, `spare_${suffix}@example.test`],
      );
      spareId = user.id;
      await h.dataSource.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE code = 'technician'`,
        [spareId],
      );
    });

    afterEach(async () => {
      await h.dataSource.query(`DELETE FROM user_roles WHERE user_id = $1`, [
        spareId,
      ]);
      await h.dataSource.query(`DELETE FROM users WHERE id = $1`, [spareId]);
    });

    const assigneeOf = async (unitId: number) => {
      const [unit]: Array<{ assignee_id: number }> = await h.dataSource.query(
        `SELECT assignee_id FROM production_units WHERE id = $1`,
        [unitId],
      );
      return unit.assignee_id;
    };

    it('refuses an assignee whose role was removed after the first check', async () => {
      const { id } = await readyOrder();
      const [first] = await h.units(id);

      const [result] = await queuedBehind<Response>(
        h.dataSource,
        HEADER_LOCK,
        [id],
        [async () => h.assign(id, first.id, { assigneeId: spareId })],
        // The assignment is past its first check and queued; the role goes before it runs.
        () =>
          h.dataSource
            .query(`DELETE FROM user_roles WHERE user_id = $1`, [spareId])
            .then(() => undefined),
      );

      expect(statusOf(result)).toBe(400);
      expect(await assigneeOf(first.id)).toBe(h.actors.techA.userId);
    });

    it('waits for a role change in flight and then refuses the assignee', async () => {
      const { id } = await readyOrder();
      const [first] = await h.units(id);

      const [result] = await queuedBehind<Response>(
        h.dataSource,
        // Holds the role row until the contender is queued, then removes it on commit.
        `DELETE FROM user_roles WHERE user_id = $1`,
        [spareId],
        [async () => h.assign(id, first.id, { assigneeId: spareId })],
      );

      expect(statusOf(result)).toBe(400);
      expect(await assigneeOf(first.id)).toBe(h.actors.techA.userId);
    });
  });
});
