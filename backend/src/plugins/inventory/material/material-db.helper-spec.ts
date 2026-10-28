import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import { orderMaterialFixture } from '@plugins/sales/_shared/ports/order-material-fixture.helper-spec';

import type { InventoryDb } from '@plugins/inventory/_shared/inventory-db.helper-spec';

export interface MaterialWorld {
  /** Part of every fixture order's code: a list search for it finds exactly these orders. */
  tag: string;
  itemA: number;
  itemB: number;
  /** sales_a's open order: MSB-01 × 2 panels (3 of A each, one unlinked line), DB-02 × 1 (1.5 of B). */
  ownOrder: number;
  /** The same panels on an order of sales_b. */
  otherOrder: number;
  /** sales_a's delivered order: it no longer needs materials. */
  deliveredOrder: number;
  salesA: number;
  salesB: number;
  cleanup(): Promise<void>;
}

/**
 * Orders with stock against them: B has 0.5 reserved, 0.5 issued and 0.2 returned for
 * `ownOrder`. Named `*.helper-spec.ts` so the build leaves it out and jest does not run it.
 */
export async function openMaterialWorld(
  db: InventoryDb,
): Promise<MaterialWorld> {
  const orders = orderMaterialFixture(db.dataSource);
  const itemA = await db.createItem();
  const itemB = await db.createItem();
  const [codeA, codeB] = [`${db.tag}-1`, `${db.tag}-2`];

  const panels = [
    {
      tag: 'MSB-01',
      quantity: 2,
      bomLines: [
        { itemId: itemA, itemCode: codeA, quantity: '3' },
        { itemId: null, itemCode: 'LEGACY-01', quantity: '5' },
      ],
    },
    {
      tag: 'DB-02',
      quantity: 1,
      bomLines: [{ itemId: itemB, itemCode: codeB, quantity: '1.5' }],
    },
  ];
  const ownOrder = await orders.createOrder({
    ownerUsername: 'sales_a',
    deliveryDate: '2026-12-01',
    panels,
  });
  const otherOrder = await orders.createOrder({
    ownerUsername: 'sales_b',
    panels,
  });
  const deliveredOrder = await orders.createOrder({
    ownerUsername: 'sales_a',
    status: 'delivered',
    panels,
  });

  await db.post({
    documentType: 'spec',
    documentId: 1,
    lines: [
      {
        itemId: itemB,
        movementType: StockMovementType.RECEIPT,
        quantity: 10,
        unitCost: 1000,
      },
    ],
  });
  await db.post({
    documentType: 'spec',
    documentId: 2,
    lines: [
      {
        itemId: itemB,
        movementType: StockMovementType.ISSUE,
        quantity: '-0.5',
        orderId: ownOrder,
      },
    ],
  });
  await db.post({
    documentType: 'spec',
    documentId: 3,
    lines: [
      {
        itemId: itemB,
        movementType: StockMovementType.WORKSHOP_RETURN,
        quantity: '0.2',
        unitCost: 1000,
        orderId: ownOrder,
      },
    ],
  });
  await db.dataSource.query(
    `INSERT INTO stock_reservations (order_id, item_id, quantity) VALUES ($1, $2, 0.5)`,
    [ownOrder, itemB],
  );
  await db.dataSource.query(
    `UPDATE stock_balances SET reserved = reserved + 0.5 WHERE item_id = $1`,
    [itemB],
  );

  return {
    tag: orders.tag,
    itemA,
    itemB,
    ownOrder,
    otherOrder,
    deliveredOrder,
    salesA: await orders.userId('sales_a'),
    salesB: await orders.userId('sales_b'),
    // Order BOM lines name the items: the orders go before the inventory helper deletes them.
    cleanup: () => orders.cleanup(),
  };
}
