import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataScopeService } from '@shared/services/data-scope.service';

import { deliveryOrderScope } from '@plugins/delivery/_shared/utils/delivery-scope.util';
import { InstallationStatus } from '@plugins/delivery/installation/constants/installation.constant';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';
import { OrderStatus } from '@plugins/sales/order/enums/order-status.enum';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { ScopeCondition } from '@plugins/production/production-order/utils/production-scope.util';
import type { EntityManager } from 'typeorm';

export const INSTALLATION_NOT_FOUND = 'Installation not found';
export const ORDER_NOT_FOUND = 'Order not found';

const WRITABLE_ORDER_STATUSES: readonly string[] = [
  OrderStatus.IN_PRODUCTION,
  OrderStatus.DELIVERED,
];

/** The installation row as a writer sees it once every lock is held. */
export interface LockedInstallation {
  status: InstallationStatus;
}

/**
 * Which orders, and so which installations, an actor may reach (D-03): one scope condition in SQL
 * on the order id, so a record outside it answers 404 and its existence is not disclosed. Also the
 * one place that takes the locks of every installation write, in the global order.
 */
@Injectable()
export class InstallationAccess {
  constructor(
    private readonly dataScope: DataScopeService,
    private readonly orders: OrderProductionPort,
  ) {}

  orderScope(actor: AuthUserPayload): (column: string) => ScopeCondition {
    return deliveryOrderScope(
      this.dataScope.scopeOf(actor),
      actor,
      this.orders,
    );
  }

  /** 404 unless the order exists and the actor's scope reaches it. */
  async assertOrderVisible(
    manager: EntityManager,
    actor: AuthUserPayload,
    orderId: number,
    message: string,
  ): Promise<void> {
    const reach = this.orderScope(actor)('o.id');
    const rows: unknown[] = await manager.query(
      `SELECT 1 FROM sales_orders o
        WHERE o.id = $${reach.params.length + 1} AND o.is_deleted = false AND (${reach.sql})`,
      [...reach.params, orderId],
    );
    if (rows.length === 0) throw new NotFoundException(message);
  }

  /** The order an installation belongs to, which never changes; 404 for an unknown one. */
  async orderOfInstallation(
    manager: EntityManager,
    installationId: number,
  ): Promise<number> {
    const [row]: Array<{ order_id: number }> = await manager.query(
      `SELECT order_id FROM installations WHERE id = $1 AND is_deleted = false`,
      [installationId],
    );
    if (!row) throw new NotFoundException(INSTALLATION_NOT_FOUND);
    return row.order_id;
  }

  /**
   * Order row, then scope (404), then the order's status (409: only an `in_production` or
   * `delivered` order takes writes), then the installation `FOR UPDATE`. Everything an
   * installation write decides on is read after this, so it cannot move under the write.
   */
  async lockForWrite(
    manager: EntityManager,
    actor: AuthUserPayload,
    installationId: number,
    orderId: number,
  ): Promise<LockedInstallation> {
    const order = await this.orders.lockForProduction(manager, orderId);
    if (!order) throw new NotFoundException(INSTALLATION_NOT_FOUND);
    await this.assertOrderVisible(
      manager,
      actor,
      orderId,
      INSTALLATION_NOT_FOUND,
    );
    this.assertOrderWritable(order);
    const [row]: Array<{ status: InstallationStatus }> = await manager.query(
      `SELECT status FROM installations
        WHERE id = $1 AND is_deleted = false FOR UPDATE`,
      [installationId],
    );
    if (!row) throw new NotFoundException(INSTALLATION_NOT_FOUND);
    return { status: row.status };
  }

  assertOrderWritable(order: { code: string; status: string }): void {
    if (!WRITABLE_ORDER_STATUSES.includes(order.status)) {
      throw new ConflictException(
        `Order ${order.code} is ${order.status}; only an in_production or delivered order takes installation changes.`,
      );
    }
  }
}
