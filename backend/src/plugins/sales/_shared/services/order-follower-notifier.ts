import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';

import { MATERIAL_READ } from '@plugins/inventory/material/permissions/material.permissions';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { ORDER_READ } from '@plugins/sales/order/permissions/order.permissions';

/** Notification: an order the follower departments work on was changed. */
export const ORDER_UPDATED_EVENT = 'sales.order.updated';

/** What happened to the order; the bell phrases the event from this. */
export type OrderChange =
  | 'edited'
  | 'cancelled'
  | 'production_released'
  | 'production_cancelled'
  | 'production_completed'
  | 'stock_issued';

/** Departments that act on an order besides its sales owner. */
export const ORDER_FOLLOWER_ROLE_CODES: readonly string[] = [
  'salesManager',
  'purchasing',
  'storekeeper',
  'productionManager',
];

export interface OrderFollowerOptions {
  /** Facts of the change that go into the payload beside the order's own. */
  extra?: Record<string, unknown>;
  /** The sales owner was already told by a notice of the same change. */
  skipOwner?: boolean;
  /** Roles already told by a notice of the same change. */
  skipRoles?: readonly string[];
}

/**
 * Tells the followers of a sales order that it changed: one broadcast to the follower roles,
 * and one record to the sales owner, who is told by name because a record naming users is
 * invisible to a role. The actor never hears of their own change. Called after the commit; a
 * failed notice is logged, never raised: the committed change stands.
 */
@Injectable()
export class OrderFollowerNotifier {
  private readonly logger = new Logger(OrderFollowerNotifier.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly orders: OrderMaterialReadPort,
    private readonly dataSource: DataSource,
  ) {}

  async notify(
    orderId: number,
    change: OrderChange,
    actorId: number,
    options: OrderFollowerOptions = {},
  ): Promise<void> {
    try {
      const header = await this.orders.getOrder(
        this.dataSource.manager,
        orderId,
      );
      if (!header) return;
      const base = {
        eventType: ORDER_UPDATED_EVENT,
        // The bell phrases the event from the payload; the text is the fallback.
        message: header.code,
        payload: {
          orderId,
          code: header.code,
          change,
          customerName: header.customerName,
          ...options.extra,
        },
        createdBy: actorId,
      };

      const roleCodes = ORDER_FOLLOWER_ROLE_CODES.filter(
        (role) => !options.skipRoles?.includes(role),
      );
      if (roleCodes.length > 0) {
        await this.notifications.emit({
          ...base,
          roleCodes,
          // The owner is told by name below, or by the production notice when skipOwner is set.
          excludeUserIds: [...new Set([actorId, header.salesOwnerId])],
          requiredScope: MATERIAL_READ,
          link: `/inventory/materials/${orderId}`,
        });
      }
      if (!options.skipOwner && header.salesOwnerId !== actorId) {
        await this.notifications.emit({
          ...base,
          roleCodes: [],
          userIds: [header.salesOwnerId],
          requiredScope: ORDER_READ,
          link: `/sales/orders/${orderId}`,
        });
      }
    } catch (error: unknown) {
      this.logger.error(
        `Could not send the ${ORDER_UPDATED_EVENT} notice (${change}) of order ${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
