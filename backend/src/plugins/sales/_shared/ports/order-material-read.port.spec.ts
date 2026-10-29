import { DataSource } from 'typeorm';

import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import {
  orderMaterialFixture,
  type OrderMaterialFixture,
} from '@plugins/sales/_shared/ports/order-material-fixture.helper-spec';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

describeWithDatabase('OrderMaterialReadPort (real Postgres)', () => {
  let dataSource: DataSource;
  let fixture: OrderMaterialFixture;
  const port = new OrderMaterialReadPort();
  let itemId: number;
  let ownOrder: number;
  let otherOrder: number;
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
    const [item]: Array<{ id: number }> = await dataSource.query(
      `INSERT INTO items (code, name, item_group, unit) VALUES ($1, 'Port spec item', 'other', 'Cái')
       RETURNING id`,
      [`${fixture.tag}-I`],
    );
    itemId = item.id;
    const panels = [
      {
        tag: 'MSB-01',
        quantity: 2,
        bomLines: [
          { itemId, itemCode: `${fixture.tag}-I`, quantity: '3' },
          { itemId: null, itemCode: 'LEGACY-01', quantity: '5' },
        ],
      },
    ];
    ownOrder = await fixture.createOrder({ ownerUsername: 'sales_a', panels });
    otherOrder = await fixture.createOrder({
      ownerUsername: 'sales_b',
      panels,
    });
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await fixture.cleanup();
    await dataSource.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    await dataSource.destroy();
  });

  const list = (
    filter: { salesOwnerId?: number },
    scope: { salesOwnerId?: number },
  ) =>
    port.listOrders(
      dataSource.manager,
      { search: fixture.tag, skip: 0, take: 50, ...filter },
      scope,
    );

  it('applies the scope condition in the list', async () => {
    const scoped = await list({}, { salesOwnerId: salesA });
    expect(scoped.rows.map((row) => row.id)).toEqual([ownOrder]);

    const unscoped = await list({}, {});
    expect(unscoped.rows.map((row) => row.id).sort()).toEqual(
      [ownOrder, otherOrder].sort(),
    );
  });

  it('never widens the scope through the sales owner filter', async () => {
    const widened = await list(
      { salesOwnerId: salesB },
      { salesOwnerId: salesA },
    );
    expect(widened).toEqual({ rows: [], count: 0 });
  });

  it('reads a header and its lines without a single money key', async () => {
    const header = await port.getOrder(dataSource.manager, ownOrder);
    expect(header).toMatchObject({
      id: ownOrder,
      status: 'open',
      projectName: 'Dự án spec',
      salesOwnerId: salesA,
    });
    const lines = (await port.getLines(dataSource.manager, [ownOrder])).get(
      ownOrder,
    );
    expect(lines?.[0]).toMatchObject({ tag: 'MSB-01', quantity: 2 });
    expect(lines?.[0].bomLines.map((bom) => bom.itemId)).toEqual([
      itemId,
      null,
    ]);

    expectNoMoneyKeys({ header, lines });
    expectNoMoneyKeys(await list({}, {}));
  });

  it('answers null for an unknown order', async () => {
    expect(await port.getOrder(dataSource.manager, 2147483000)).toBeNull();
  });

  it('sums the estimate’s BOM amounts times panel quantities per item, and nothing without one', async () => {
    const estimated = await fixture.createOrder({
      ownerUsername: 'sales_a',
      panels: [
        {
          tag: 'MSB-01',
          quantity: 2,
          bomLines: [
            {
              itemId,
              itemCode: `${fixture.tag}-I`,
              quantity: '3',
              estimateUnitCost: '95000',
            },
          ],
        },
      ],
    });

    const costs = await port.estimatedCostByItem(dataSource.manager, estimated);
    // 3 × 95 000 = 285 000 per panel, × 2 panels.
    expect(Number(costs.get(itemId))).toBe(570000);
    expect(
      (await port.estimatedCostByItem(dataSource.manager, ownOrder)).size,
    ).toBe(0);
  });

  it('holds the order row FOR SHARE: a writer of the row waits, another reader does not', async () => {
    const holder = dataSource.createQueryRunner();
    const other = dataSource.createQueryRunner();
    await holder.connect();
    await other.connect();
    try {
      await holder.startTransaction();
      const header = await port.lockOrderForMaterial(holder.manager, ownOrder);
      expect(header?.id).toBe(ownOrder);
      expect(
        await port.lockOrderForMaterial(holder.manager, 2147483000),
      ).toBeNull();

      await other.startTransaction();
      // A second document shares the lock.
      expect(
        (await port.lockOrderForMaterial(other.manager, ownOrder))?.id,
      ).toBe(ownOrder);
      await other.rollbackTransaction();

      // A cancel writes the row: it cannot take it while the document holds it.
      await other.startTransaction();
      await expect(
        other.query(
          `SELECT id FROM sales_orders WHERE id = $1 FOR UPDATE NOWAIT`,
          [ownOrder],
        ),
      ).rejects.toThrow(/could not obtain lock/);
    } finally {
      if (other.isTransactionActive) await other.rollbackTransaction();
      if (holder.isTransactionActive) await holder.rollbackTransaction();
      await other.release();
      await holder.release();
    }
  });
});
