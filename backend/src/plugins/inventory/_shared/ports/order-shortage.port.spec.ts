import { expectNoMoneyKeys } from '@kernel/shared/testing/money-keys.helper-spec';

import {
  describeWithDatabase,
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { shortageKit } from '@plugins/inventory/_shared/order-shortage.helper-spec';
import {
  reservationKit,
  type ReservationKit,
} from '@plugins/inventory/material/reservation-db.helper-spec';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

describeWithDatabase('OrderShortagePort (real Postgres)', () => {
  let db: InventoryDb;
  let kit: ReservationKit;
  let shortage: ReturnType<typeof shortageKit>;
  const director: AuthUserPayload = { userId: 1, role: 'director' };

  beforeAll(async () => {
    db = await openInventoryDb();
    kit = reservationKit(db);
    shortage = shortageKit(db.dataSource);
  });

  afterAll(async () => {
    await kit?.cleanup();
    await db?.close();
  });

  const stock = (itemId: number, quantity: number) =>
    db.post({
      documentType: 'spec_opening',
      documentId: itemId,
      lines: [
        {
          itemId,
          movementType: StockMovementType.RECEIPT,
          quantity,
          unitCost: 1000,
        },
      ],
    });

  it('lists the items an order is short of, equal to the material view, quantities only', async () => {
    const x = await db.createItem();
    const y = await db.createItem();
    await stock(x, 4);
    // Needs 6 of X with 4 on hand, and 1 of Y with none: short 2 of X and 1 of Y.
    const { orderId } = await kit.createOrder({
      bom: [
        { itemId: x, perPanel: '6' },
        { itemId: y, perPanel: '1' },
      ],
    });

    const short = await shortage.port.shortByOrder(orderId);

    expect(short.map((row) => [row.itemId, row.short])).toEqual([
      [x, 2],
      [y, 1],
    ]);
    for (const row of short) {
      expect(await shortage.viewShort(orderId, row.itemId, director)).toBe(
        row.short,
      );
    }
    expectNoMoneyKeys(short);
  });

  it('lists nothing for an order that is covered or missing', async () => {
    const z = await db.createItem();
    await stock(z, 5);
    const { orderId } = await kit.createOrder({
      bom: [{ itemId: z, perPanel: '5' }],
    });

    expect(await shortage.port.shortByOrder(orderId)).toEqual([]);
    expect(await shortage.port.shortByOrder(2147483647)).toEqual([]);
  });
});
