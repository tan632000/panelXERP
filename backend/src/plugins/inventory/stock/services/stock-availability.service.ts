import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Quantities only: whoever may read availability sees no cost, whatever else they hold. */
export interface StockAvailabilityRow {
  itemId: number;
  onHand: number;
  reserved: number;
  available: number;
}

/**
 * Stock of a set of items for the estimate BOM grid. An item without a balance row has
 * nothing on hand; deleted and unknown ids are left out rather than refused, so a revision
 * that still names a deleted item keeps loading.
 */
@Injectable()
export class StockAvailabilityService {
  constructor(private readonly dataSource: DataSource) {}

  async findByItems(itemIds: number[]): Promise<StockAvailabilityRow[]> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT i.id AS item_id,
              COALESCE(b.on_hand, 0) AS on_hand,
              COALESCE(b.reserved, 0) AS reserved,
              COALESCE(b.on_hand, 0) - COALESCE(b.reserved, 0) AS available
         FROM items i
         LEFT JOIN stock_balances b ON b.item_id = i.id
         WHERE i.id = ANY($1::int[]) AND i.is_deleted = false
         ORDER BY i.id ASC`,
      [[...new Set(itemIds)]],
    );
    return rows.map((row) => ({
      itemId: Number(row.item_id),
      onHand: Number(row.on_hand),
      reserved: Number(row.reserved),
      available: Number(row.available),
    }));
  }
}
