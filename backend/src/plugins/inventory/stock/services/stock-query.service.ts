import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { resolvePagination } from '@shared/utils/pagination.util';
import { escapeLikePattern } from '@shared/utils/typeorm-search.util';

import { withoutCosts } from '@plugins/inventory/_shared/utils/purchase-price.util';
import {
  StockFilterDto,
  StockMovementFilterDto,
} from '@plugins/inventory/stock/dto/stock-filter.dto';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';

export interface StockRow {
  itemId: number;
  code: string;
  name: string;
  unit: string;
  defaultLocationId: number | null;
  locationCode: string | null;
  locationName: string | null;
  onHand: number;
  reserved: number;
  available: number;
  minStock: number | null;
  low: boolean;
  /** `value / onHand`, 4 dp; null while nothing is on hand. */
  avgCost: number | null;
  value: number;
}

export interface StockMovementRow {
  id: string;
  movementType: StockMovementType;
  quantity: number;
  unitCost: number;
  value: number;
  referenceValue: number | null;
  onHandAfter: number;
  avgCostAfter: number;
  documentType: string;
  documentId: number;
  documentLineId: number | null;
  orderId: number | null;
  orderLineId: number | null;
  reason: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
}

const STOCK_COST_KEYS = ['avgCost', 'value'] as const;
const MOVEMENT_COST_KEYS = [
  'unitCost',
  'value',
  'referenceValue',
  'avgCostAfter',
] as const;

/** A raw `pg` row: `numeric` and `bigint` arrive as strings, timestamps as dates. */
type RawRow = Record<string, unknown>;

/** `numeric` arrives from `pg` as a string; the API serves numbers for display. */
const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
/** Text columns arrive as strings or null. */
const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

/**
 * Reads of the stock list and an item's ledger. Every item without a balance row is listed
 * with zero stock, so the list is the whole active catalog. Costs are left out of both
 * responses unless the actor may read purchase prices.
 */
@Injectable()
export class StockQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(query: StockFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );

    const conditions = ['i.is_deleted = false'];
    const params: unknown[] = [];
    const search = query.search?.trim();
    if (search) {
      params.push(`%${escapeLikePattern(search)}%`);
      conditions.push(
        `(erp_unaccent(i.code) ILIKE erp_unaccent($${params.length})
          OR erp_unaccent(i.name) ILIKE erp_unaccent($${params.length}))`,
      );
    }
    if (query.locationId) {
      params.push(query.locationId);
      conditions.push(`i.default_location_id = $${params.length}`);
    }
    if (query.lowOnly) {
      conditions.push(
        `i.min_stock IS NOT NULL
         AND COALESCE(b.on_hand, 0) - COALESCE(b.reserved, 0) < i.min_stock`,
      );
    }
    params.push(take, skip);

    const rows: RawRow[] = await this.dataSource.query(
      `SELECT i.id AS item_id, i.code, i.name, i.unit, i.default_location_id,
                l.code AS location_code, l.name AS location_name,
                COALESCE(b.on_hand, 0) AS on_hand,
                COALESCE(b.reserved, 0) AS reserved,
                COALESCE(b.on_hand, 0) - COALESCE(b.reserved, 0) AS available,
                i.min_stock,
                (i.min_stock IS NOT NULL
                 AND COALESCE(b.on_hand, 0) - COALESCE(b.reserved, 0) < i.min_stock) AS low,
                CASE WHEN b.on_hand > 0 THEN ROUND(b.value / b.on_hand, 4) END AS avg_cost,
                COALESCE(b.value, 0) AS value,
                COUNT(*) OVER () AS total_rows
         FROM items i
         LEFT JOIN stock_balances b ON b.item_id = i.id
         LEFT JOIN locations l ON l.id = i.default_location_id AND l.is_deleted = false
         WHERE ${conditions.join(' AND ')}
         ORDER BY i.code ASC, i.id ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const total = rows.length > 0 ? Number(rows[0].total_rows) : 0;
    const data = rows.map((row) =>
      withoutCosts(this.toStockRow(row), STOCK_COST_KEYS, actor),
    );
    return paginate(data, total, page, limit);
  }

  async findMovements(
    itemId: number,
    query: StockMovementFilterDto,
    actor: AuthUserPayload,
  ) {
    const [item]: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM items WHERE id = $1 AND is_deleted = false`,
      [itemId],
    );
    if (!item) throw new NotFoundException(`Item ${itemId} not found.`);

    const { page, limit, skip, take } = resolvePagination(query);
    const rows: RawRow[] = await this.dataSource.query(
      `SELECT m.*, u.full_name AS created_by_name, COUNT(*) OVER () AS total_rows
         FROM stock_movements m
         LEFT JOIN users u ON u.id = m.created_by
         WHERE m.item_id = $1
         ORDER BY m.id DESC
         LIMIT $2 OFFSET $3`,
      [itemId, take, skip],
    );

    const total = rows.length > 0 ? Number(rows[0].total_rows) : 0;
    const data = rows.map((row) =>
      withoutCosts(this.toMovementRow(row), MOVEMENT_COST_KEYS, actor),
    );
    return paginate(data, total, page, limit);
  }

  private toStockRow(row: RawRow): StockRow {
    return {
      itemId: Number(row.item_id),
      code: String(row.code),
      name: String(row.name),
      unit: String(row.unit),
      defaultLocationId: numberOrNull(row.default_location_id),
      locationCode: textOrNull(row.location_code),
      locationName: textOrNull(row.location_name),
      onHand: Number(row.on_hand),
      reserved: Number(row.reserved),
      available: Number(row.available),
      minStock: numberOrNull(row.min_stock),
      low: row.low === true,
      avgCost: numberOrNull(row.avg_cost),
      value: Number(row.value),
    };
  }

  private toMovementRow(row: RawRow): StockMovementRow {
    return {
      id: String(row.id),
      movementType: row.movement_type as StockMovementType,
      quantity: Number(row.quantity),
      unitCost: Number(row.unit_cost),
      value: Number(row.value),
      referenceValue: numberOrNull(row.reference_value),
      onHandAfter: Number(row.on_hand_after),
      avgCostAfter: Number(row.avg_cost_after),
      documentType: String(row.document_type),
      documentId: Number(row.document_id),
      documentLineId: numberOrNull(row.document_line_id),
      orderId: numberOrNull(row.order_id),
      orderLineId: numberOrNull(row.order_line_id),
      reason: textOrNull(row.reason),
      createdBy: numberOrNull(row.created_by),
      createdByName: textOrNull(row.created_by_name),
      createdAt: row.created_at as Date,
    };
  }
}
