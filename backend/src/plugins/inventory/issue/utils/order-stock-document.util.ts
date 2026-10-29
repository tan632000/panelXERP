import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type {
  MaterialOrderHeader,
  OrderMaterialReadPort,
} from '@plugins/sales/_shared/ports/order-material-read.port';
import type { DataScopeService } from '@shared/services/data-scope.service';
import type { EntityManager } from 'typeorm';

/** The two documents that move stock for an order; their tables share one header shape. */
export type OrderStockTable = 'stock_issues' | 'stock_workshop_returns';

/**
 * The order `FOR SHARE` (the first lock of the document, D-04), answering 404 for an order the
 * actor's material scope does not reach, exactly like a missing one.
 */
export async function lockVisibleOrder(
  manager: EntityManager,
  orders: OrderMaterialReadPort,
  dataScope: DataScopeService,
  orderId: number,
  actor: AuthUserPayload,
): Promise<MaterialOrderHeader> {
  const order = await orders.lockOrderForMaterial(manager, orderId);
  if (!order || !dataScope.canSeeMaterial(actor, order)) {
    throw new NotFoundException('Order not found');
  }
  return order;
}

export function assertOrderStatus(
  order: MaterialOrderHeader,
  allowed: readonly string[],
  action: string,
): void {
  if (!allowed.includes(order.status)) {
    throw new ConflictException(
      `Order ${order.code} is ${order.status}: ${action}.`,
    );
  }
}

/** Every panel line a document names must be one of the order's (400 otherwise). */
export async function assertPanelsOfOrder(
  manager: EntityManager,
  orders: OrderMaterialReadPort,
  order: MaterialOrderHeader,
  lines: ReadonlyArray<{ orderLineId?: number | null }>,
): Promise<void> {
  if (!lines.some((line) => line.orderLineId)) return;
  const panels =
    (await orders.getLines(manager, [order.id])).get(order.id) ?? [];
  const panelIds = new Set(panels.map((panel) => panel.id));
  for (const line of lines) {
    if (line.orderLineId && !panelIds.has(line.orderLineId)) {
      throw new BadRequestException(
        `Line ${line.orderLineId} is not a panel of order ${order.code}.`,
      );
    }
  }
}

/** Inserts the header with its request key; a twin of the same key fails on the unique index. */
export async function insertOrderStockHeader(
  manager: EntityManager,
  table: OrderStockTable,
  header: {
    code: string;
    orderId: number;
    note: string | null;
    requestKey: string | null;
    actorId: number;
  },
): Promise<number> {
  const [row]: Array<{ id: number }> = await manager.query(
    `INSERT INTO ${table} (code, order_id, note, request_key, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      header.code,
      header.orderId,
      header.note,
      header.requestKey,
      header.actorId,
    ],
  );
  return Number(row.id);
}

export async function storedDocumentId(
  manager: EntityManager,
  table: OrderStockTable,
  requestKey: string | undefined,
): Promise<number | null> {
  if (!requestKey) return null;
  const [row]: Array<{ id: number }> = await manager.query(
    `SELECT id FROM ${table} WHERE request_key = $1`,
    [requestKey],
  );
  return row ? Number(row.id) : null;
}

/** What went to the workshop for the order, net of returns: quantity and the cost it carried. */
export interface NetIssued {
  quantity: Decimal;
  /** Σ issue values − Σ return values, positive. */
  value: Decimal;
}

const NONE: NetIssued = { quantity: new Decimal(0), value: new Decimal(0) };

/**
 * Net issued per item of the order, summed in SQL numeric. Issues are stored negative and
 * returns positive, both in quantity and value, so the negated sums are what is still out.
 * Read under the balance locks: a concurrent document of the same item has committed or waits.
 */
export async function netIssuedOf(
  manager: EntityManager,
  orderId: number,
  itemIds: readonly number[],
): Promise<Map<number, NetIssued>> {
  const rows: Array<{ item_id: number; quantity: string; value: string }> =
    await manager.query(
      `SELECT item_id, (-SUM(quantity))::text AS quantity, (-SUM(value))::text AS value
         FROM stock_movements
        WHERE order_id = $1 AND item_id = ANY($2::int[])
          AND movement_type IN ('issue', 'workshop_return')
        GROUP BY item_id`,
      [orderId, [...itemIds]],
    );
  return new Map(
    rows.map((row) => [
      Number(row.item_id),
      { quantity: new Decimal(row.quantity), value: new Decimal(row.value) },
    ]),
  );
}

export function netIssuedAt(
  net: Map<number, NetIssued>,
  itemId: number,
): NetIssued {
  return net.get(itemId) ?? NONE;
}

/** Each line's quantity as an exact decimal, and their sum per item. */
export function quantitiesOf(
  lines: ReadonlyArray<{ itemId: number; quantity: number }>,
): {
  quantities: Decimal[];
  perItem: Map<number, Decimal>;
} {
  const quantities = lines.map((line) => new Decimal(String(line.quantity)));
  const perItem = new Map<number, Decimal>();
  for (const [index, line] of lines.entries()) {
    perItem.set(
      line.itemId,
      (perItem.get(line.itemId) ?? new Decimal(0)).add(quantities[index]),
    );
  }
  return { quantities, perItem };
}
