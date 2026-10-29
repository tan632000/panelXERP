import { Injectable, Logger } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';

import { isPostgresUniqueViolation } from '@shared/utils/db-error.util';

import {
  DEMAND_BEARING_STATUSES,
  ORDER_SHORT_EVENT,
  ORDER_SHORT_OWNER_EVENT,
} from '@plugins/inventory/material/constants/material.constant';
import { MATERIAL_READ } from '@plugins/inventory/material/permissions/material.permissions';
import {
  holdingOf,
  loadHoldings,
  shortageOf,
} from '@plugins/inventory/material/utils/order-holdings.util';
import { StockAlertService } from '@plugins/inventory/stock/services/stock-alert.service';
import {
  OrderMaterialReadPort,
  type MaterialOrderHeader,
} from '@plugins/sales/_shared/ports/order-material-read.port';

const PURCHASING_ROLE = 'purchasing';
const CANCELLED_STATUS = 'cancelled';

const dedupeKeyOf = (orderId: number) => `order:${orderId}`;

/**
 * Shortage notices (D-15), after the commit that changed reservations: a notice is never part
 * of the stock change, and a failed one must not undo it. Purchasing and the order's sales
 * owner each get one open notice per short order; when the order's shortage reaches 0 — by its
 * own change or another order's — both dedupe slots are released, and a cancelled order closes
 * both. Then the low-stock check runs for the touched items, whose available stock moved.
 */
@Injectable()
export class ShortageAlertService {
  private readonly logger = new Logger(ShortageAlertService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrderMaterialReadPort,
    private readonly notifications: NotificationService,
    private readonly stockAlerts: StockAlertService,
  ) {}

  async afterCommit(
    orderIds: readonly number[],
    itemIds: readonly number[],
  ): Promise<void> {
    for (const orderId of [...new Set(orderIds)]) {
      try {
        await this.evaluate(orderId);
      } catch (error: unknown) {
        this.logger.error(
          `Could not update the shortage notices of order ${orderId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    await this.stockAlerts.afterCommit(itemIds);
  }

  /** Items of the order still short, counted in decimals. */
  async shortItemCount(orderId: number): Promise<number> {
    const manager = this.dataSource.manager;
    const demands = await this.orders.openDemand(
      manager,
      { orderId },
      DEMAND_BEARING_STATUSES,
    );
    const holdings = await loadHoldings(
      manager,
      demands.map((demand) => demand.itemId),
    );
    return demands.filter((demand) =>
      shortageOf(
        demand.demand,
        holdingOf(holdings, orderId, demand.itemId),
      ).greaterThan(new Decimal(0)),
    ).length;
  }

  private async evaluate(orderId: number): Promise<void> {
    const order = await this.orders.getOrder(this.dataSource.manager, orderId);
    if (!order) return;
    if (order.status === CANCELLED_STATUS) {
      for (const eventType of [ORDER_SHORT_EVENT, ORDER_SHORT_OWNER_EVENT]) {
        await this.notifications.close({
          eventType,
          dedupeKey: dedupeKeyOf(orderId),
        });
      }
      return;
    }

    const short = await this.shortItemCount(orderId);
    if (short > 0) {
      await this.raise(order, short, ORDER_SHORT_EVENT, {
        roleCodes: [PURCHASING_ROLE],
      });
      await this.raise(order, short, ORDER_SHORT_OWNER_EVENT, {
        roleCodes: [],
        userIds: [order.salesOwnerId],
      });
    } else {
      for (const eventType of [ORDER_SHORT_EVENT, ORDER_SHORT_OWNER_EVENT]) {
        await this.notifications.releaseDedupeKey({
          eventType,
          dedupeKey: dedupeKeyOf(orderId),
        });
      }
    }
  }

  private async raise(
    order: MaterialOrderHeader,
    shortItemCount: number,
    eventType: string,
    audience: { roleCodes: string[]; userIds?: number[] },
  ): Promise<void> {
    const dedupeKey = dedupeKeyOf(order.id);
    if (await this.notifications.findOpenByDedupeKey(eventType, dedupeKey)) {
      return;
    }
    try {
      await this.notifications.emit({
        eventType,
        ...audience,
        // The bell phrases the event from the payload; the text is the fallback.
        message: order.code,
        requiredScope: MATERIAL_READ,
        link: `/inventory/materials/${order.id}`,
        dedupeKey,
        payload: {
          orderId: order.id,
          code: order.code,
          customerName: order.customerName,
          shortItemCount,
        },
      });
    } catch (error: unknown) {
      // A concurrent change raised the same notice first: that one stands.
      if (!isPostgresUniqueViolation(error)) throw error;
    }
  }
}
