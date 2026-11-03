import { Injectable } from '@nestjs/common';

import { MaterialService } from '@plugins/inventory/material/services/material.service';

/** One item an order still lacks. Quantities only: no price, cost or value. */
export interface OrderShortItem {
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  demand: number;
  reserved: number;
  short: number;
}

/**
 * What other plugins may ask inventory about an order's shortage. The figures come from the
 * material view's own computation, so a screen elsewhere can never disagree with it.
 */
@Injectable()
export class OrderShortagePort {
  constructor(private readonly materials: MaterialService) {}

  /** The items of the order with a shortage above 0, by item code; empty for a missing order. */
  async shortByOrder(orderId: number): Promise<OrderShortItem[]> {
    const rows = (await this.materials.itemRowsOf(orderId)) ?? [];
    return rows
      .filter((row) => row.short > 0)
      .map((row) => ({
        itemId: row.itemId,
        itemCode: row.itemCode,
        itemName: row.itemName,
        itemUnit: row.itemUnit,
        demand: row.demand,
        reserved: row.reserved,
        short: row.short,
      }));
  }
}
