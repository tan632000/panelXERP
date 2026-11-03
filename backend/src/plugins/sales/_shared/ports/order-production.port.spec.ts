import { ConflictException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import {
  orderMaterialFixture,
  type OrderMaterialFixture,
} from '@plugins/sales/_shared/ports/order-material-fixture.helper-spec';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

describeWithDatabase('OrderProductionPort (real Postgres)', () => {
  let dataSource: DataSource;
  let fixture: OrderMaterialFixture;
  const port = new OrderProductionPort();
  let salesA: number;
  let salesB: number;

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
    });
    try {
      await dataSource.initialize();
    } catch (error: unknown) {
      throw new Error(
        `Postgres is unreachable (${error instanceof Error ? error.message : String(error)}). Run inside the compose backend container, or set SKIP_DB_SPECS=1 to skip these checks.`,
      );
    }
    fixture = orderMaterialFixture(dataSource);
    salesA = await fixture.userId('sales_a');
    salesB = await fixture.userId('sales_b');
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await fixture.cleanup();
    await dataSource.destroy();
  });

  const orderOf = (status: string, owner = 'sales_a') =>
    fixture.createOrder({
      ownerUsername: owner,
      status,
      panels: [
        { tag: 'MSB-01', quantity: 3, bomLines: [] },
        { tag: 'DB-02', quantity: 1, bomLines: [] },
      ],
    });
  const statusOf = async (orderId: number) => {
    const [row]: Array<{ status: string }> = await dataSource.query(
      `SELECT status FROM sales_orders WHERE id = $1`,
      [orderId],
    );
    return row.status;
  };
  const inTransaction = <T>(work: (manager: EntityManager) => Promise<T>) =>
    dataSource.transaction(work);

  describe('lockForProduction', () => {
    it('reads the order and its panel lines, with no price', async () => {
      const orderId = await orderOf('open');

      const order = await inTransaction((manager) =>
        port.lockForProduction(manager, orderId),
      );

      expect(order).toMatchObject({
        id: orderId,
        status: 'open',
        lines: [
          { tag: 'MSB-01', quantity: 3, description: null },
          { tag: 'DB-02', quantity: 1, description: null },
        ],
      });
      expectNoMoneyKeys(order);
    });

    it('answers null for an order that does not exist', async () => {
      const order = await inTransaction((manager) =>
        port.lockForProduction(manager, 2147483000),
      );
      expect(order).toBeNull();
    });

    it('holds the order row until the transaction ends', async () => {
      const orderId = await orderOf('open');
      const holder = dataSource.createQueryRunner();
      await holder.connect();
      try {
        await holder.startTransaction();
        await port.lockForProduction(holder.manager, orderId);
        await expect(
          dataSource.query(
            `SELECT id FROM sales_orders WHERE id = $1 FOR UPDATE NOWAIT`,
            [orderId],
          ),
        ).rejects.toMatchObject({ code: '55P03' });
      } finally {
        await holder.rollbackTransaction();
        await holder.release();
      }
      await expect(
        dataSource.query(
          `SELECT id FROM sales_orders WHERE id = $1 FOR UPDATE NOWAIT`,
          [orderId],
        ),
      ).resolves.toHaveLength(1);
    });
  });

  describe('moveStatus', () => {
    it('moves the order only from the status the caller names', async () => {
      const orderId = await orderOf('open');

      await inTransaction((manager) =>
        port.moveStatus(manager, orderId, 'open', 'in_production'),
      );
      expect(await statusOf(orderId)).toBe('in_production');

      // A second move from `open` finds `in_production`: 409, nothing written.
      await expect(
        inTransaction((manager) =>
          port.moveStatus(manager, orderId, 'open', 'in_production'),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await statusOf(orderId)).toBe('in_production');

      await inTransaction((manager) =>
        port.moveStatus(manager, orderId, 'in_production', 'open'),
      );
      expect(await statusOf(orderId)).toBe('open');
    });

    it('never brings a cancelled order back to life', async () => {
      const orderId = await orderOf('cancelled');

      await expect(
        inTransaction((manager) =>
          port.moveStatus(manager, orderId, 'open', 'in_production'),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await statusOf(orderId)).toBe('cancelled');
    });

    it('refuses an order that does not exist', async () => {
      await expect(
        inTransaction((manager) =>
          port.moveStatus(manager, 2147483000, 'open', 'in_production'),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('ownerScopeCondition', () => {
    const visibleTo = async (userId: number, orderIds: number[]) => {
      const condition = port.ownerScopeCondition('o.id', { userId }, 2);
      const rows: Array<{ id: number }> = await dataSource.query(
        `SELECT o.id FROM sales_orders o
          WHERE o.id = ANY($1::int[]) AND ${condition.sql} ORDER BY o.id`,
        [orderIds, ...condition.params],
      );
      return rows.map((row) => row.id);
    };

    it('keeps an order column to the orders the actor owns now, not at creation', async () => {
      const own = await orderOf('open', 'sales_a');
      const other = await orderOf('open', 'sales_b');

      expect(await visibleTo(salesA, [own, other])).toEqual([own]);
      expect(await visibleTo(salesB, [own, other])).toEqual([other]);

      // The request changes hands, as it does when its customer is reassigned.
      await dataSource.query(
        `UPDATE sales_requests SET sales_owner_id = $2
          WHERE id = (SELECT request_id FROM sales_orders WHERE id = $1)`,
        [own, salesB],
      );
      expect(await visibleTo(salesA, [own, other])).toEqual([]);
      expect(await visibleTo(salesB, [own, other])).toEqual(
        [own, other].sort(),
      );
    });

    it('refuses a column that is not a plain reference', () => {
      expect(() =>
        port.ownerScopeCondition('o.id; DROP TABLE x', { userId: 1 }, 1),
      ).toThrow('Invalid order column');
    });
  });
});
