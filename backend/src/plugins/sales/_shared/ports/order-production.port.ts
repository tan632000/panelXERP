import { ConflictException, Injectable } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

/** One panel line of the order: what production turns into cabinets. No price, no BOM. */
export interface ProductionOrderLine {
  id: number;
  tag: string;
  description: string | null;
  /** Panels ordered: one production unit each. */
  quantity: number;
}

/** The order as production sees it while it holds the order row. */
export interface LockedProductionOrder {
  id: number;
  code: string;
  status: string;
  lines: ProductionOrderLine[];
}

type RawRow = Record<string, unknown>;

/**
 * How production reads and moves a sales order without knowing the sales tables, on the
 * caller's manager. It is the only writer of an order's status on production's behalf, so the
 * rule "the status moves only from the one this transaction read" lives in one place.
 */
@Injectable()
export class OrderProductionPort {
  /**
   * The order row `FOR UPDATE` for the rest of the transaction, with its panel lines, or null
   * when it does not exist. The first lock of every production write that touches the order
   * (global lock order: order → production order → units).
   */
  async lockForProduction(
    manager: EntityManager,
    orderId: number,
  ): Promise<LockedProductionOrder | null> {
    const [order]: RawRow[] = await manager.query(
      `SELECT o.id, o.code, o.status
         FROM sales_orders o
        WHERE o.id = $1 AND o.is_deleted = false
        FOR UPDATE OF o`,
      [orderId],
    );
    if (!order) return null;
    const lines: RawRow[] = await manager.query(
      `SELECT id, tag, description, quantity
         FROM sales_order_lines WHERE order_id = $1 ORDER BY id`,
      [orderId],
    );
    return {
      id: Number(order.id),
      code: String(order.code),
      status: String(order.status),
      lines: lines.map((line) => ({
        id: Number(line.id),
        tag: String(line.tag),
        description:
          typeof line.description === 'string' ? line.description : null,
        quantity: Number(line.quantity),
      })),
    };
  }

  /**
   * Moves the order `from → to` only if it still has the status `from` (`UPDATE … WHERE
   * status = :from`); any other status, a deleted or a missing order answers 409, so a stale
   * read can never overwrite what another writer committed.
   */
  async moveStatus(
    manager: EntityManager,
    orderId: number,
    from: string,
    to: string,
  ): Promise<void> {
    // An UPDATE answers `[rows, affectedCount]` through `manager.query`.
    const [moved]: [RawRow[], number] = await manager.query(
      `UPDATE sales_orders
          SET status = $3, updated_at = NOW()
        WHERE id = $1 AND status = $2 AND is_deleted = false
        RETURNING id`,
      [orderId, from, to],
    );
    if (moved.length !== 1) {
      throw new ConflictException(
        `Order ${orderId} is no longer ${from} and cannot become ${to}.`,
      );
    }
  }

  /**
   * A SQL condition keeping an order id column of another table to the orders the actor owns
   * NOW (the owner of the order's request, never a snapshot), so a reassigned customer takes
   * the order away from its former owner at once. `column` is the caller's own column
   * reference (`alias.order_id`), never user input.
   */
  ownerScopeCondition(
    column: string,
    actor: { userId: number },
    nextParameter: number,
  ): { sql: string; params: unknown[] } {
    if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(column)) {
      throw new Error(`Invalid order column: ${column}`);
    }
    return {
      sql: `${column} IN (SELECT o.id
              FROM sales_orders o
              JOIN sales_requests r ON r.id = o.request_id AND r.is_deleted = false
             WHERE o.is_deleted = false AND r.sales_owner_id = $${nextParameter})`,
      params: [actor.userId],
    };
  }
}
