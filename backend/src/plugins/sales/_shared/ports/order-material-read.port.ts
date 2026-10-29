import { Injectable } from '@nestjs/common';

import { escapeLikePattern } from '@shared/utils/typeorm-search.util';

import type { EntityManager } from 'typeorm';

/**
 * What an order's material view may know about the order. Deliberately no money: these types
 * carry no price, amount, discount, VAT or total, so a reader built on them cannot leak one.
 */
export interface MaterialOrderHeader {
  id: number;
  code: string;
  status: string;
  deliveryDate: string | null;
  createdAt: Date;
  customerName: string;
  projectName: string | null;
  requestId: number;
  salesOwnerId: number;
  salesOwnerName: string | null;
}

export interface MaterialBomLine {
  id: number;
  /** Null on a legacy line the backfill could not link: it counts towards no demand. */
  itemId: number | null;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  /** Quantity for ONE panel, as numeric text. */
  quantity: string;
}

export interface MaterialOrderLine {
  id: number;
  tag: string;
  description: string | null;
  /** Panels ordered. */
  quantity: number;
  bomLines: MaterialBomLine[];
}

export interface MaterialOrderFilter {
  status?: string;
  /** Order code, customer, project or request code. */
  search?: string;
  /** Narrows to one sales owner; AND-ed with the scope, so it never widens it. */
  salesOwnerId?: number;
  skip: number;
  take: number;
}

/** What one order needs of one item: Σ linked BOM quantity × panels, as numeric text. */
export interface OrderItemDemand {
  orderId: number;
  deliveryDate: string | null;
  itemId: number;
  demand: string;
}

/** The scope condition from `materialListCondition`: an owner the actor is limited to. */
export interface MaterialScopeCondition {
  salesOwnerId?: number;
}

type RawRow = Record<string, unknown>;

const HEADER_SELECT = `
  SELECT o.id, o.code, o.status, o.delivery_date, o.created_at, o.customer_name,
         o.project_name, o.request_id, r.sales_owner_id, u.full_name AS sales_owner_name`;
const HEADER_FROM = `
    FROM sales_orders o
    JOIN sales_requests r ON r.id = o.request_id AND r.is_deleted = false
    LEFT JOIN users u ON u.id = r.sales_owner_id`;

/** A `date` column arrives as text or as a date at local midnight. */
const dateOnly = (value: unknown): string | null => {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return null;
};
const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

/**
 * How inventory reads an order's materials without knowing the sales tables, on the caller's
 * manager. The visibility scope is the caller's to compute; the list applies it in SQL, so a
 * page never holds an order the caller's detail would refuse.
 */
@Injectable()
export class OrderMaterialReadPort {
  async listOrders(
    manager: EntityManager,
    filter: MaterialOrderFilter,
    scope: MaterialScopeCondition,
  ): Promise<{ rows: MaterialOrderHeader[]; count: number }> {
    const conditions = ['o.is_deleted = false'];
    const params: unknown[] = [];
    const add = (sql: (placeholder: string) => string, value: unknown) => {
      params.push(value);
      conditions.push(sql(`$${params.length}`));
    };

    if (scope.salesOwnerId !== undefined) {
      add((p) => `r.sales_owner_id = ${p}`, scope.salesOwnerId);
    }
    if (filter.salesOwnerId !== undefined) {
      add((p) => `r.sales_owner_id = ${p}`, filter.salesOwnerId);
    }
    if (filter.status) add((p) => `o.status = ${p}`, filter.status);
    const search = filter.search?.trim();
    if (search) {
      add(
        (p) => `(erp_unaccent(o.code) ILIKE erp_unaccent(${p})
          OR erp_unaccent(o.customer_name) ILIKE erp_unaccent(${p})
          OR erp_unaccent(COALESCE(o.project_name, '')) ILIKE erp_unaccent(${p})
          OR erp_unaccent(r.code) ILIKE erp_unaccent(${p}))`,
        `%${escapeLikePattern(search)}%`,
      );
    }
    params.push(filter.take, filter.skip);

    const rows: RawRow[] = await manager.query(
      `${HEADER_SELECT}, COUNT(*) OVER () AS total_rows
       ${HEADER_FROM}
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.delivery_date ASC NULLS LAST, o.id ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      rows: rows.map((row) => this.toHeader(row)),
      count: rows.length > 0 ? Number(rows[0].total_rows) : 0,
    };
  }

  /** One order's header, or null when it does not exist. The caller decides visibility. */
  async getOrder(
    manager: EntityManager,
    orderId: number,
  ): Promise<MaterialOrderHeader | null> {
    const [row]: RawRow[] = await manager.query(
      `${HEADER_SELECT} ${HEADER_FROM} WHERE o.id = $1 AND o.is_deleted = false`,
      [orderId],
    );
    return row ? this.toHeader(row) : null;
  }

  /**
   * The demand of every order in `statuses` for the given items (or of one order), summed in
   * SQL numeric over linked BOM lines. Unlinked lines never count.
   */
  async openDemand(
    manager: EntityManager,
    filter: { itemIds?: readonly number[]; orderId?: number },
    statuses: readonly string[],
  ): Promise<OrderItemDemand[]> {
    const conditions = [
      'o.is_deleted = false',
      'o.status = ANY($1::text[])',
      'b.item_id IS NOT NULL',
    ];
    const params: unknown[] = [[...statuses]];
    if (filter.itemIds) {
      params.push([...filter.itemIds]);
      conditions.push(`b.item_id = ANY($${params.length}::int[])`);
    }
    if (filter.orderId !== undefined) {
      params.push(filter.orderId);
      conditions.push(`o.id = $${params.length}`);
    }
    const rows: RawRow[] = await manager.query(
      `SELECT o.id AS order_id, o.delivery_date, b.item_id,
              SUM(b.quantity * l.quantity)::text AS demand
         FROM sales_orders o
         JOIN sales_order_lines l ON l.order_id = o.id
         JOIN sales_order_bom_lines b ON b.line_id = l.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY o.id, o.delivery_date, b.item_id`,
      params,
    );
    return rows.map((row) => ({
      orderId: Number(row.order_id),
      deliveryDate: dateOnly(row.delivery_date),
      itemId: Number(row.item_id),
      demand: String(row.demand),
    }));
  }

  /** Every catalog item the order's BOM links to, whatever its status, ascending. */
  async linkedItemIds(
    manager: EntityManager,
    orderId: number,
  ): Promise<number[]> {
    const rows: Array<{ item_id: number }> = await manager.query(
      `SELECT DISTINCT b.item_id
         FROM sales_order_bom_lines b
         JOIN sales_order_lines l ON l.id = b.line_id
        WHERE l.order_id = $1 AND b.item_id IS NOT NULL
        ORDER BY b.item_id`,
      [orderId],
    );
    return rows.map((row) => Number(row.item_id));
  }

  /** The panel lines and their BOM of each order, keyed by order id, in line order. */
  async getLines(
    manager: EntityManager,
    orderIds: readonly number[],
  ): Promise<Map<number, MaterialOrderLine[]>> {
    const byOrder = new Map<number, MaterialOrderLine[]>(
      orderIds.map((id) => [id, []]),
    );
    if (orderIds.length === 0) return byOrder;

    const lines: RawRow[] = await manager.query(
      `SELECT id, order_id, tag, description, quantity
         FROM sales_order_lines WHERE order_id = ANY($1::int[])
        ORDER BY order_id, id`,
      [[...orderIds]],
    );
    const boms: RawRow[] = await manager.query(
      `SELECT b.id, b.line_id, b.item_id, b.item_code, b.item_name, b.item_unit,
              b.quantity::text AS quantity
         FROM sales_order_bom_lines b
         JOIN sales_order_lines l ON l.id = b.line_id
        WHERE l.order_id = ANY($1::int[])
        ORDER BY b.line_id, b.id`,
      [[...orderIds]],
    );

    const bomByLine = new Map<number, MaterialBomLine[]>();
    for (const bom of boms) {
      const lineId = Number(bom.line_id);
      const list = bomByLine.get(lineId) ?? [];
      list.push({
        id: Number(bom.id),
        itemId: bom.item_id === null ? null : Number(bom.item_id),
        itemCode: String(bom.item_code),
        itemName: String(bom.item_name),
        itemUnit: String(bom.item_unit),
        quantity: String(bom.quantity),
      });
      bomByLine.set(lineId, list);
    }
    for (const line of lines) {
      byOrder.get(Number(line.order_id))?.push({
        id: Number(line.id),
        tag: String(line.tag),
        description: textOrNull(line.description),
        quantity: Number(line.quantity),
        bomLines: bomByLine.get(Number(line.id)) ?? [],
      });
    }
    return byOrder;
  }

  private toHeader(row: RawRow): MaterialOrderHeader {
    return {
      id: Number(row.id),
      code: String(row.code),
      status: String(row.status),
      deliveryDate: dateOnly(row.delivery_date),
      createdAt: row.created_at as Date,
      customerName: String(row.customer_name),
      projectName: textOrNull(row.project_name),
      requestId: Number(row.request_id),
      salesOwnerId: Number(row.sales_owner_id),
      salesOwnerName: textOrNull(row.sales_owner_name),
    };
  }
}
