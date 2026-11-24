import type { DataSource } from 'typeorm';

/** Quantity every item without stock history starts with in a development database. */
export const OPENING_STOCK_QUANTITY = 1000;

/**
 * Gives each live item that has never had a stock movement an opening-balance receipt, so the
 * ledger and the balance agree. Cost is zero because the demo data has no purchase price; an
 * item with any history (a real receipt, issue or count) is left alone, so running it again
 * adds nothing.
 */
export async function seedOpeningStock(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `WITH todo AS (
       SELECT i.id FROM items i
        WHERE i.is_deleted = false
          AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.item_id = i.id)
     ),
     posted AS (
       INSERT INTO stock_movements
         (item_id, movement_type, quantity, unit_cost, value, on_hand_after,
          avg_cost_after, document_type, document_id, reason)
       SELECT id, 'receipt', $1, 0, 0, $1, 0, 'opening_balance', 0,
              'Opening balance (development seed)'
         FROM todo
       RETURNING item_id
     )
     INSERT INTO stock_balances (item_id, on_hand, reserved, value)
     SELECT item_id, $1, 0, 0 FROM posted
     ON CONFLICT (item_id) DO UPDATE SET on_hand = EXCLUDED.on_hand, updated_at = now()`,
    [OPENING_STOCK_QUANTITY],
  );
}
