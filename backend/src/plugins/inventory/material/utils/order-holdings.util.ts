import { Decimal } from 'decimal.js';

import type { EntityManager } from 'typeorm';

/** What one order holds of one item: its reservation and what went to the workshop, net. */
export interface Holding {
  reserved: Decimal;
  /** Issued less returned. */
  netIssued: Decimal;
}

export const holdingKey = (orderId: number, itemId: number) =>
  `${orderId}:${itemId}`;

const NOTHING: Holding = {
  reserved: new Decimal(0),
  netIssued: new Decimal(0),
};

/**
 * Reservations and net workshop issues per order and item, for the given items, summed in SQL
 * numeric. An issue is stored negative and a workshop return positive, so `-quantity` over
 * both is issued less returned.
 */
export async function loadHoldings(
  manager: EntityManager,
  itemIds: readonly number[],
): Promise<Map<string, Holding>> {
  const holdings = new Map<string, Holding>();
  if (itemIds.length === 0) return holdings;
  const rows: Array<{
    order_id: number;
    item_id: number;
    reserved: string;
    net_issued: string;
  }> = await manager.query(
    `SELECT order_id, item_id, SUM(reserved)::text AS reserved,
            SUM(net_issued)::text AS net_issued
       FROM (
         SELECT order_id, item_id, quantity AS reserved, 0 AS net_issued
           FROM stock_reservations WHERE item_id = ANY($1::int[])
         UNION ALL
         SELECT order_id, item_id, 0, -quantity
           FROM stock_movements
          WHERE item_id = ANY($1::int[]) AND order_id IS NOT NULL
            AND movement_type IN ('issue', 'workshop_return')
       ) x
      GROUP BY order_id, item_id`,
    [[...itemIds]],
  );
  for (const row of rows) {
    holdings.set(holdingKey(Number(row.order_id), Number(row.item_id)), {
      reserved: new Decimal(row.reserved),
      netIssued: new Decimal(row.net_issued),
    });
  }
  return holdings;
}

export function holdingOf(
  holdings: Map<string, Holding>,
  orderId: number,
  itemId: number,
): Holding {
  return holdings.get(holdingKey(orderId, itemId)) ?? NOTHING;
}

/** D-05: `max(0, demand − (issued − returned) − reserved)`. */
export function shortageOf(demand: Decimal.Value, holding: Holding): Decimal {
  return Decimal.max(
    0,
    new Decimal(demand).sub(holding.netIssued).sub(holding.reserved),
  );
}
