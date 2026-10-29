import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import {
  DataScopeService,
  materialListCondition,
} from '@shared/services/data-scope.service';
import { resolvePagination } from '@shared/utils/pagination.util';
import { escapeLikePattern } from '@shared/utils/typeorm-search.util';

import { withoutCosts } from '@plugins/inventory/_shared/utils/purchase-price.util';
import { OrderStockDocumentFilterDto } from '@plugins/inventory/issue/dto/stock-issue-filter.dto';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { OrderStockTable } from '@plugins/inventory/issue/utils/order-stock-document.util';

/** Hidden from an actor without `purchase_price:read`: a storekeeper must not learn the cost. */
const LINE_MONEY_KEYS = ['unitCost', 'value'] as const;

const LINES: Record<
  OrderStockTable,
  { table: string; parent: string; text: 'reason' | 'note' }
> = {
  stock_issues: {
    table: 'stock_issue_lines',
    parent: 'issue_id',
    text: 'reason',
  },
  stock_workshop_returns: {
    table: 'stock_workshop_return_lines',
    parent: 'return_id',
    text: 'note',
  },
};

export interface OrderStockDocumentRow {
  id: number;
  code: string;
  orderId: number;
  orderCode: string | null;
  customerName: string | null;
  note: string | null;
  lineCount: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
}

export interface OrderStockDocumentLine {
  id: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  orderLineId: number | null;
  quantity: number;
  unitCost: number;
  value: number;
  /** The over-BOM reason of an issue line, the note of a return line. */
  reason: string | null;
}

export interface OrderStockDocumentDetail extends OrderStockDocumentRow {
  lines: Array<
    OrderStockDocumentLine | Omit<OrderStockDocumentLine, 'unitCost' | 'value'>
  >;
}

type RawRow = Record<string, unknown>;

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

/**
 * Lists and details of issues and workshop returns. The order's code and customer come from the
 * sales port, which carries no money; line costs only reach an actor holding
 * `purchase_price:read`. A detail of an order outside the actor's material scope is a 404.
 */
@Injectable()
export class OrderStockDocumentReader {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrderMaterialReadPort,
    private readonly dataScope: DataScopeService,
  ) {}

  /**
   * One page of documents, limited in SQL to the orders the actor's material scope reaches
   * (D-09): an order outside it is not counted, not paged and not named.
   */
  async findAll(
    table: OrderStockTable,
    query: OrderStockDocumentFilterDto,
    actor: AuthUserPayload,
  ) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const scope = this.orders.scopedOrderCondition(
      'd.order_id',
      materialListCondition(this.dataScope.scopeOf(actor), actor.userId),
      1,
    );
    const conditions = [scope.sql];
    const params: unknown[] = [...scope.params];
    if (query.orderId) {
      params.push(query.orderId);
      conditions.push(`d.order_id = $${params.length}`);
    }
    const search = query.search?.trim();
    if (search) {
      params.push(`%${escapeLikePattern(search)}%`);
      conditions.push(
        `erp_unaccent(d.code) ILIKE erp_unaccent($${params.length})`,
      );
    }
    params.push(take, skip);
    const lines = LINES[table];
    const rows: RawRow[] = await this.dataSource.query(
      `SELECT d.*, u.full_name AS created_by_name,
              (SELECT COUNT(*) FROM ${lines.table} l WHERE l.${lines.parent} = d.id) AS line_count,
              COUNT(*) OVER () AS total_rows
         FROM ${table} d
         LEFT JOIN users u ON u.id = d.created_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY d.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = rows.length > 0 ? Number(rows[0].total_rows) : 0;
    const headers = await this.orders.getOrders(this.dataSource.manager, [
      ...new Set(rows.map((row) => Number(row.order_id))),
    ]);
    return paginate(
      rows.map((row) => {
        const order = headers.get(Number(row.order_id)) ?? null;
        return this.toRow(
          row,
          order?.code ?? null,
          order?.customerName ?? null,
        );
      }),
      total,
      page,
      limit,
    );
  }

  async findOne(
    table: OrderStockTable,
    id: number,
    actor: AuthUserPayload,
  ): Promise<OrderStockDocumentDetail> {
    const lines = LINES[table];
    const [head]: RawRow[] = await this.dataSource.query(
      `SELECT d.*, u.full_name AS created_by_name,
              (SELECT COUNT(*) FROM ${lines.table} l WHERE l.${lines.parent} = d.id) AS line_count
         FROM ${table} d
         LEFT JOIN users u ON u.id = d.created_by
        WHERE d.id = $1`,
      [id],
    );
    const order = head
      ? await this.orders.getOrder(
          this.dataSource.manager,
          Number(head.order_id),
        )
      : null;
    if (!head || !order || !this.dataScope.canSeeMaterial(actor, order)) {
      throw new NotFoundException('Document not found');
    }

    const rows: RawRow[] = await this.dataSource.query(
      `SELECT l.*, i.code AS item_code, i.name AS item_name, i.unit AS item_unit
         FROM ${lines.table} l
         JOIN items i ON i.id = l.item_id
        WHERE l.${lines.parent} = $1
        ORDER BY l.id`,
      [id],
    );
    return {
      ...this.toRow(head, order.code, order.customerName),
      lines: rows.map((row) =>
        withoutCosts(
          {
            id: Number(row.id),
            itemId: Number(row.item_id),
            itemCode: String(row.item_code),
            itemName: String(row.item_name),
            itemUnit: String(row.item_unit),
            orderLineId:
              row.order_line_id === null ? null : Number(row.order_line_id),
            quantity: Number(row.quantity),
            unitCost: Number(row.unit_cost),
            value: Number(row.value),
            reason: textOrNull(row[lines.text]),
          },
          LINE_MONEY_KEYS,
          actor,
        ),
      ),
    };
  }

  private toRow(
    row: RawRow,
    orderCode: string | null,
    customerName: string | null,
  ): OrderStockDocumentRow {
    return {
      id: Number(row.id),
      code: String(row.code),
      orderId: Number(row.order_id),
      orderCode,
      customerName,
      note: textOrNull(row.note),
      lineCount: Number(row.line_count),
      createdBy: row.created_by === null ? null : Number(row.created_by),
      createdByName: textOrNull(row.created_by_name),
      createdAt: row.created_at as Date,
    };
  }
}
