import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import {
  DataScopeService,
  materialListCondition,
} from '@shared/services/data-scope.service';
import { resolvePagination } from '@shared/utils/pagination.util';

import { MaterialOrderFilterDto } from '@plugins/inventory/material/dto/material-filter.dto';
import {
  OrderMaterialReadPort,
  type MaterialOrderHeader,
  type MaterialOrderLine,
} from '@plugins/sales/_shared/ports/order-material-read.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/**
 * The order statuses that still need their materials. P3 adds `in_production` here, and only
 * here: every demand figure follows this one predicate.
 */
const DEMAND_BEARING_STATUSES: ReadonlySet<string> = new Set(['open']);

/** One item of an order: what it needs, what is set aside, what went to the workshop. */
export interface MaterialItemRow {
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  demand: number;
  reserved: number;
  /** Issued to the workshop, gross. */
  issued: number;
  /** Returned from the workshop. */
  returned: number;
  /** `max(0, demand − (issued − returned) − reserved)`. */
  short: number;
}

export interface MaterialPanelBomLine {
  bomLineId: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  perPanelQuantity: number;
  /** `perPanelQuantity × panel quantity`. */
  demand: number;
}

export interface MaterialPanel {
  lineId: number;
  tag: string;
  description: string | null;
  quantity: number;
  bomLines: MaterialPanelBomLine[];
}

/** A BOM line with no catalog item: shown so someone links it, counted in no demand. */
export interface UnlinkedBomLine {
  bomLineId: number;
  lineId: number;
  tag: string;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  perPanelQuantity: number;
}

export interface OrderMaterialDetail {
  order: MaterialOrderHeader;
  /** False once the order no longer needs materials (delivered, cancelled…): demand is 0. */
  demandBearing: boolean;
  items: MaterialItemRow[];
  panels: MaterialPanel[];
  unlinked: UnlinkedBomLine[];
}

export interface OrderMaterialRow extends MaterialOrderHeader {
  /** Items still short. */
  shortLineCount: number;
  unlinkedCount: number;
}

interface ItemFigures {
  itemCode: string;
  itemName: string;
  itemUnit: string;
  demand: Decimal;
  reserved: Decimal;
  issued: Decimal;
  returned: Decimal;
}

type RawRow = Record<string, unknown>;

/**
 * Orders seen from the warehouse: per order and item the demand (D-05), the reservation, the
 * workshop issues and returns, and the shortage. Built on the sales port, which carries no
 * money, so no price, discount, VAT or total can reach a response.
 */
@Injectable()
export class MaterialService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrderMaterialReadPort,
    private readonly dataScope: DataScopeService,
  ) {}

  async findOrders(query: MaterialOrderFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const manager = this.dataSource.manager;
    const { rows, count } = await this.orders.listOrders(
      manager,
      {
        status: query.status,
        search: query.search,
        salesOwnerId: query.salesOwnerId,
        skip,
        take,
      },
      materialListCondition(this.dataScope.scopeOf(actor), actor.userId),
    );

    const ids = rows.map((row) => row.id);
    const lines = await this.orders.getLines(manager, ids);
    const stock = await this.stockFigures(manager, ids);
    const data: OrderMaterialRow[] = rows.map((order) => {
      const orderLines = lines.get(order.id) ?? [];
      const items = this.itemRows(order, orderLines, stock.get(order.id));
      return {
        ...order,
        shortLineCount: items.filter((item) => item.short > 0).length,
        unlinkedCount: this.unlinkedOf(orderLines).length,
      };
    });
    return paginate(data, count, page, limit);
  }

  /** One order's materials; an order outside the actor's scope answers 404, like a missing one. */
  async findOrder(
    orderId: number,
    actor: AuthUserPayload,
  ): Promise<OrderMaterialDetail> {
    const manager = this.dataSource.manager;
    const order = await this.orders.getOrder(manager, orderId);
    if (!order || !this.dataScope.canSeeMaterial(actor, order)) {
      throw new NotFoundException('Order not found');
    }
    const orderLines =
      (await this.orders.getLines(manager, [orderId])).get(orderId) ?? [];
    const stock = (await this.stockFigures(manager, [orderId])).get(orderId);

    return {
      order,
      demandBearing: DEMAND_BEARING_STATUSES.has(order.status),
      items: this.itemRows(order, orderLines, stock),
      panels: orderLines.map((line) => ({
        lineId: line.id,
        tag: line.tag,
        description: line.description,
        quantity: line.quantity,
        bomLines: line.bomLines.flatMap((bom) =>
          bom.itemId === null
            ? []
            : [
                {
                  bomLineId: bom.id,
                  itemId: bom.itemId,
                  itemCode: bom.itemCode,
                  itemName: bom.itemName,
                  itemUnit: bom.itemUnit,
                  perPanelQuantity: Number(bom.quantity),
                  demand: new Decimal(bom.quantity)
                    .mul(line.quantity)
                    .toNumber(),
                },
              ],
        ),
      })),
      unlinked: this.unlinkedOf(orderLines),
    };
  }

  /**
   * Per item of the order: demand from its linked BOM lines (0 when the order bears no demand),
   * plus every item it holds a reservation for or moved stock for, even if no longer on the BOM.
   */
  private itemRows(
    order: MaterialOrderHeader,
    lines: readonly MaterialOrderLine[],
    stock: Map<number, ItemFigures> | undefined,
  ): MaterialItemRow[] {
    const figures = new Map<number, ItemFigures>();
    const figuresOf = (
      itemId: number,
      named: Pick<ItemFigures, 'itemCode' | 'itemName' | 'itemUnit'>,
    ) => {
      let entry = figures.get(itemId);
      if (!entry) {
        entry = {
          ...named,
          demand: new Decimal(0),
          reserved: new Decimal(0),
          issued: new Decimal(0),
          returned: new Decimal(0),
        };
        figures.set(itemId, entry);
      }
      return entry;
    };

    const bearing = DEMAND_BEARING_STATUSES.has(order.status);
    for (const line of lines) {
      for (const bom of line.bomLines) {
        if (bom.itemId === null) continue;
        const entry = figuresOf(bom.itemId, bom);
        if (bearing) {
          entry.demand = entry.demand.add(
            new Decimal(bom.quantity).mul(line.quantity),
          );
        }
      }
    }
    for (const [itemId, moved] of stock ?? []) {
      const entry = figuresOf(itemId, moved);
      entry.reserved = moved.reserved;
      entry.issued = moved.issued;
      entry.returned = moved.returned;
    }

    return [...figures.entries()]
      .map(([itemId, entry]) => {
        const netIssued = entry.issued.sub(entry.returned);
        const short = Decimal.max(
          0,
          entry.demand.sub(netIssued).sub(entry.reserved),
        );
        return {
          itemId,
          itemCode: entry.itemCode,
          itemName: entry.itemName,
          itemUnit: entry.itemUnit,
          demand: entry.demand.toNumber(),
          reserved: entry.reserved.toNumber(),
          issued: entry.issued.toNumber(),
          returned: entry.returned.toNumber(),
          short: short.toNumber(),
        };
      })
      .sort((a, b) => a.itemCode.localeCompare(b.itemCode));
  }

  private unlinkedOf(lines: readonly MaterialOrderLine[]): UnlinkedBomLine[] {
    return lines.flatMap((line) =>
      line.bomLines
        .filter((bom) => bom.itemId === null)
        .map((bom) => ({
          bomLineId: bom.id,
          lineId: line.id,
          tag: line.tag,
          itemCode: bom.itemCode,
          itemName: bom.itemName,
          itemUnit: bom.itemUnit,
          perPanelQuantity: Number(bom.quantity),
        })),
    );
  }

  /** Reservations and workshop movements per order and item, as exact decimals. */
  private async stockFigures(
    manager: EntityManager,
    orderIds: readonly number[],
  ): Promise<Map<number, Map<number, ItemFigures>>> {
    const byOrder = new Map<number, Map<number, ItemFigures>>();
    if (orderIds.length === 0) return byOrder;

    const rows: RawRow[] = await manager.query(
      `SELECT x.order_id, x.item_id, i.code, i.name, i.unit,
              SUM(x.reserved)::text AS reserved,
              SUM(x.issued)::text AS issued,
              SUM(x.returned)::text AS returned
         FROM (
           SELECT order_id, item_id, quantity AS reserved, 0 AS issued, 0 AS returned
             FROM stock_reservations WHERE order_id = ANY($1::int[])
           UNION ALL
           SELECT order_id, item_id, 0,
                  CASE WHEN movement_type = 'issue' THEN -quantity ELSE 0 END,
                  CASE WHEN movement_type = 'workshop_return' THEN quantity ELSE 0 END
             FROM stock_movements
            WHERE order_id = ANY($1::int[])
              AND movement_type IN ('issue', 'workshop_return')
         ) x
         JOIN items i ON i.id = x.item_id
        GROUP BY x.order_id, x.item_id, i.code, i.name, i.unit`,
      [[...orderIds]],
    );
    for (const row of rows) {
      const orderId = Number(row.order_id);
      const items = byOrder.get(orderId) ?? new Map<number, ItemFigures>();
      items.set(Number(row.item_id), {
        itemCode: String(row.code),
        itemName: String(row.name),
        itemUnit: String(row.unit),
        demand: new Decimal(0),
        reserved: new Decimal(String(row.reserved)),
        issued: new Decimal(String(row.issued)),
        returned: new Decimal(String(row.returned)),
      });
      byOrder.set(orderId, items);
    }
    return byOrder;
  }
}
