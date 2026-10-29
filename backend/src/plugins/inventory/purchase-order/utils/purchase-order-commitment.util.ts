/**
 * What a purchase order line still commits and still brings in (D-11), as SQL over a line alias
 * and its order alias, so a request's ordered quantity and an order's incoming stock are always
 * derived from the orders as they are — a cancel, a close or a supplier return needs no writer
 * of its own to keep them right.
 *
 * - committed: the quantity; what was received once the order is closed; 0 once cancelled.
 * - incoming: committed less received, never negative; 0 once closed or cancelled.
 */
export function committedSql(order: string, line: string): string {
  return `CASE ${order}.status
            WHEN 'cancelled' THEN 0
            WHEN 'closed' THEN ${line}.received_qty
            ELSE ${line}.quantity END`;
}

export function incomingSql(order: string, line: string): string {
  return `CASE WHEN ${order}.status IN ('cancelled', 'closed') THEN 0
            ELSE GREATEST(0, ${line}.quantity - ${line}.received_qty) END`;
}
