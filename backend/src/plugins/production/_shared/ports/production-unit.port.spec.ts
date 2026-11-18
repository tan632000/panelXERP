import { NotFoundException } from '@nestjs/common';

import { ProductionUnitPort } from '@plugins/production/_shared/ports/production-unit.port';
import {
  describeWithDatabase,
  openProductionHarness,
  type ProductionHarness,
} from '@plugins/production/production-order/production-db.helper-spec';
import { releasedOrder } from '@plugins/production/progress/progress-db.helper-spec';

import type { ScopeCondition } from '@plugins/production/production-order/utils/production-scope.util';

const everything = (): ScopeCondition => ({ sql: 'TRUE', params: [] });
const nothing = (): ScopeCondition => ({ sql: 'FALSE', params: [] });

/**
 * The cabinet port against the real Postgres of the compose stack: the locks it takes, the
 * cancelled production order it ignores or still reports, and the filters of its list.
 */
describeWithDatabase('Production unit port (real Postgres)', () => {
  jest.setTimeout(60_000);

  const port = new ProductionUnitPort();
  let h: ProductionHarness;

  beforeAll(async () => {
    h = await openProductionHarness([]);
  });

  afterAll(async () => {
    await h?.close();
  });

  const isLocked: ProductionHarness['isLocked'] = (table, id) =>
    h.isLocked(table, id);

  const finishFinishing = (unitId: number) =>
    h.dataSource.query(
      `UPDATE production_unit_stages SET status = 'done'
        WHERE unit_id = $1 AND stage = 'finishing'`,
      [unitId],
    );

  it('locks the live production order, then its cabinets by ascending id, with their finishing status', async () => {
    const { orderId, id, units } = await releasedOrder(h, 3);
    await finishFinishing(units[0].id);

    const locked = await h.dataSource.transaction(async (manager) => {
      const rows = await port.lockOrderUnits(manager, orderId);
      return {
        rows,
        header: await isLocked('production_orders', id),
        cabinets: await Promise.all(
          units.map((unit) => isLocked('production_units', unit.id)),
        ),
      };
    });

    expect(locked.rows.map((row) => row.unitId)).toEqual(
      units.map((unit) => unit.id),
    );
    expect(locked.rows.map((row) => row.finishingDone)).toEqual([
      true,
      false,
      false,
    ]);
    expect(locked.rows[0]).toMatchObject({
      code: units[0].code,
      tag: 'MSB',
      productionOrderId: id,
      productionOrderStatus: 'released',
      orderId,
    });
    expect(locked.header).toBe(true);
    expect(locked.cabinets).toEqual([true, true, true]);
    // Once the transaction ended the probe sees the rows free, so it does measure the lock.
    expect(await isLocked('production_orders', id)).toBe(false);
    expect(await isLocked('production_units', units[0].id)).toBe(false);
  });

  it('ignores a cancelled production order and an order without one', async () => {
    const { orderId, id } = await releasedOrder(h, 2);
    await h
      .post(`/production/orders/${id}/cancel`, { reason: 'Redesign' })
      .expect(200);
    const bare = await h.newOrder();

    await h.dataSource.transaction(async (manager) => {
      expect(await port.lockOrderUnits(manager, orderId)).toEqual([]);
      expect(await port.lockOrderUnits(manager, bare)).toEqual([]);
    });
  });

  it('locks one cabinet after its header, and still returns a cabinet of a cancelled production order', async () => {
    const { id, units } = await releasedOrder(h, 2);
    const [first, second] = units;

    const live = await h.dataSource.transaction(async (manager) => ({
      view: await port.lockUnit(manager, first.id),
      header: await isLocked('production_orders', id),
      own: await isLocked('production_units', first.id),
      sibling: await isLocked('production_units', second.id),
    }));
    expect(live.view).toMatchObject({
      unitId: first.id,
      productionOrderId: id,
      productionOrderStatus: 'released',
      finishingDone: false,
    });
    expect(live).toMatchObject({ header: true, own: true, sibling: false });

    await h
      .post(`/production/orders/${id}/cancel`, { reason: 'Redesign' })
      .expect(200);
    await h.dataSource.transaction(async (manager) => {
      expect(await port.lockUnit(manager, first.id)).toMatchObject({
        unitId: first.id,
        productionOrderStatus: 'cancelled',
      });
      await expect(port.lockUnit(manager, 2147483000)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('lists every matching cabinet without paging, narrowed by scope, order and finishing status', async () => {
    const mine = await releasedOrder(h, 3);
    const other = await releasedOrder(h, 2);
    await finishFinishing(mine.units[1].id);

    await h.dataSource.transaction(async (manager) => {
      const ids = async (
        filter: Parameters<ProductionUnitPort['listUnits']>[1],
      ) => (await port.listUnits(manager, filter)).map((row) => row.unitId);

      expect(await ids({ orderScope: nothing })).toEqual([]);
      expect(
        await ids({ orderScope: everything, orderId: mine.orderId }),
      ).toEqual(mine.units.map((unit) => unit.id));
      expect(
        await ids({
          orderScope: everything,
          orderId: mine.orderId,
          finishingDone: true,
        }),
      ).toEqual([mine.units[1].id]);
      expect(
        await ids({
          orderScope: everything,
          orderId: mine.orderId,
          finishingDone: false,
        }),
      ).toEqual([mine.units[0].id, mine.units[2].id]);

      expect(
        await ids({ orderScope: everything, unitId: mine.units[2].id }),
      ).toEqual([mine.units[2].id]);
      expect(
        await ids({ orderScope: nothing, unitId: mine.units[2].id }),
      ).toEqual([]);

      // Without `orderId` every order comes back, ordered by production order then cabinet.
      const unfiltered = await ids({ orderScope: everything });
      const expected = [...mine.units, ...other.units].map((unit) => unit.id);
      expect(unfiltered.filter((unitId) => expected.includes(unitId))).toEqual(
        expected,
      );

      // The scope's own parameter is `$1`; the port numbers the order id after it.
      const ownerOnly = (column: string): ScopeCondition => ({
        sql: `${column} = $1`,
        params: [mine.orderId],
      });
      expect(await ids({ orderScope: ownerOnly })).toEqual(
        mine.units.map((unit) => unit.id),
      );
      expect(
        await ids({ orderScope: ownerOnly, orderId: other.orderId }),
      ).toEqual([]);
    });
  });
});
