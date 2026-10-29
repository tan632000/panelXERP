import { Decimal } from 'decimal.js';

import {
  committedSql,
  incomingSql,
} from '@plugins/inventory/purchase-order/utils/purchase-order-commitment.util';

import type { EntityManager } from 'typeorm';

/** One request line with what its purchase order lines have taken of it (D-11). */
export interface RequestLineState {
  id: number;
  requestId: number;
  lineNo: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  quantity: Decimal;
  neededBy: string | null;
  note: string | null;
  sourceOrderId: number | null;
  /** Σ committed of the purchase order lines made from it. */
  ordered: Decimal;
  /** `max(0, quantity − ordered)`. */
  remaining: Decimal;
}

type RawRow = Record<string, unknown>;

const dateOnly = (value: unknown): string | null => {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return null;
};

/**
 * The lines of the given requests with their ordered and remaining quantities, summed in SQL
 * numeric from the purchase order lines that point at them, in line order.
 */
export async function loadRequestLines(
  manager: EntityManager,
  requestIds: readonly number[],
): Promise<RequestLineState[]> {
  if (requestIds.length === 0) return [];
  const rows: RawRow[] = await manager.query(
    `SELECT l.id, l.request_id, l.line_no, l.item_id, l.needed_by, l.note, l.source_order_id,
            l.quantity::text AS quantity, i.code AS item_code, i.name AS item_name,
            i.unit AS item_unit,
            COALESCE((SELECT SUM(${committedSql('po', 'pl')})
                        FROM purchase_order_lines pl
                        JOIN purchase_orders po ON po.id = pl.purchase_order_id
                       WHERE pl.pr_line_id = l.id AND po.is_deleted = false), 0)::text AS ordered
       FROM purchase_request_lines l
       JOIN items i ON i.id = l.item_id
      WHERE l.request_id = ANY($1::int[])
      ORDER BY l.request_id, l.line_no, l.id`,
    [[...requestIds]],
  );
  return rows.map((row) => {
    const quantity = new Decimal(String(row.quantity));
    const ordered = new Decimal(String(row.ordered));
    return {
      id: Number(row.id),
      requestId: Number(row.request_id),
      lineNo: Number(row.line_no),
      itemId: Number(row.item_id),
      itemCode: String(row.item_code),
      itemName: String(row.item_name),
      itemUnit: String(row.item_unit),
      quantity,
      neededBy: dateOnly(row.needed_by),
      note: typeof row.note === 'string' ? row.note : null,
      sourceOrderId:
        row.source_order_id === null ? null : Number(row.source_order_id),
      ordered,
      remaining: Decimal.max(0, quantity.sub(ordered)),
    };
  });
}

/**
 * What is already on its way for one order, per item: the remaining of its open (not cancelled)
 * request lines, and the incoming of the purchase order lines bought for it.
 */
export async function pendingSupplyOf(
  manager: EntityManager,
  orderId: number,
): Promise<Map<number, Decimal>> {
  const requested: Array<{ request_id: number }> = await manager.query(
    `SELECT DISTINCT l.request_id FROM purchase_request_lines l
       JOIN purchase_requests r ON r.id = l.request_id
      WHERE l.source_order_id = $1 AND r.is_cancelled = false`,
    [orderId],
  );
  const pending = new Map<number, Decimal>();
  const add = (itemId: number, quantity: Decimal) =>
    pending.set(itemId, (pending.get(itemId) ?? new Decimal(0)).add(quantity));

  const lines = await loadRequestLines(
    manager,
    requested.map((row) => Number(row.request_id)),
  );
  for (const line of lines) {
    if (line.sourceOrderId === orderId) add(line.itemId, line.remaining);
  }
  const incoming: Array<{ item_id: number; incoming: string }> =
    await manager.query(
      `SELECT pl.item_id, SUM(${incomingSql('po', 'pl')})::text AS incoming
         FROM purchase_order_lines pl
         JOIN purchase_orders po ON po.id = pl.purchase_order_id
        WHERE pl.source_order_id = $1 AND po.is_deleted = false
        GROUP BY pl.item_id`,
      [orderId],
    );
  for (const row of incoming) {
    add(Number(row.item_id), new Decimal(row.incoming));
  }
  return pending;
}

/** `cancelled`, else `ordered` once nothing remains on any line, else `open`. */
export function requestStatusOf(
  isCancelled: boolean,
  lines: readonly RequestLineState[],
): 'cancelled' | 'ordered' | 'open' {
  if (isCancelled) return 'cancelled';
  return lines.length > 0 && lines.every((line) => line.remaining.isZero())
    ? 'ordered'
    : 'open';
}
