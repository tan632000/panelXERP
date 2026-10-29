import { Notification } from '@kernel/core/audit/notification.entity';
import { NotificationService } from '@kernel/core/audit/notification.service';

import { ReservationService } from '@plugins/inventory/material/services/reservation.service';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import { StockAlertService } from '@plugins/inventory/stock/services/stock-alert.service';
import { OrderLifecycleRegistry } from '@plugins/sales/_shared/ports/order-lifecycle-registry';
import { orderMaterialFixture } from '@plugins/sales/_shared/ports/order-material-fixture.helper-spec';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

import type { InventoryDb } from '@plugins/inventory/_shared/inventory-db.helper-spec';
import type { ReservationChange } from '@plugins/inventory/material/services/reservation.service';
import type { FixtureBomLine } from '@plugins/sales/_shared/ports/order-material-fixture.helper-spec';

export interface OrderSpec {
  owner?: string;
  deliveryDate?: string | null;
  /** Panels ordered, each with these BOM lines per panel. */
  panels?: number;
  /** Per panel; `estimateUnitCost` also puts the line on the order's estimate at that cost. */
  bom: Array<{ itemId: number; perPanel: string; estimateUnitCost?: string }>;
}

export interface ReservationKit {
  reservations: ReservationService;
  alerts: ShortageAlertService;
  /** An open order, then its create hook in one transaction, as a convert runs it. */
  createOrder(
    spec: OrderSpec,
  ): Promise<{ orderId: number; change: ReservationChange }>;
  /** Cancels the order and runs its cancel hook in one transaction, as a cancel runs it. */
  cancel(orderId: number): Promise<ReservationChange>;
  /** A receipt of `quantity`, then allocation of the item, in one transaction. */
  receive(itemId: number, quantity: string): Promise<ReservationChange>;
  /** Reservations of the item per order id, as exact numeric text. */
  reservationsOf(itemId: number): Promise<Record<number, string>>;
  /** The balance next to the sum of the item's reservations, as numeric text. */
  balanceOf(
    itemId: number,
  ): Promise<{ onHand: string; reserved: string; sum: string }>;
  cleanup(): Promise<void>;
}

/**
 * The reservation services wired on the inventory spec database, with orders written straight
 * to the sales tables and the hooks run the way convert and cancel run them. Named
 * `*.helper-spec.ts` so the build leaves it out and jest does not run it as a test.
 */
export function reservationKit(db: InventoryDb): ReservationKit {
  const port = new OrderMaterialReadPort();
  // Emit, close, release and find use only the notification table.
  const notifications = new NotificationService(
    db.dataSource.getRepository(Notification),
    null as never,
    null as never,
  );
  const alerts = new ShortageAlertService(
    db.dataSource,
    port,
    notifications,
    new StockAlertService(db.dataSource, notifications),
  );
  const reservations = new ReservationService(
    db.posting,
    port,
    new OrderLifecycleRegistry(),
    alerts,
  );
  const orders = orderMaterialFixture(db.dataSource);
  const orderIds: number[] = [];
  let receiptNo = 0;

  return {
    reservations,
    alerts,
    async createOrder(spec) {
      const bomLines: FixtureBomLine[] = spec.bom.map((line) => ({
        itemId: line.itemId,
        itemCode: `I${line.itemId}`,
        quantity: line.perPanel,
        estimateUnitCost: line.estimateUnitCost,
      }));
      const orderId = await orders.createOrder({
        ownerUsername: spec.owner ?? 'sales_a',
        deliveryDate: spec.deliveryDate ?? null,
        panels: [{ tag: 'MSB-01', quantity: spec.panels ?? 1, bomLines }],
      });
      orderIds.push(orderId);
      const change = await db.dataSource.transaction((manager) =>
        reservations.reserveForOrder(manager, orderId),
      );
      return { orderId, change };
    },
    cancel(orderId) {
      return db.dataSource.transaction(async (manager) => {
        await manager.query(
          `UPDATE sales_orders SET status = 'cancelled' WHERE id = $1`,
          [orderId],
        );
        return reservations.releaseOrder(manager, orderId);
      });
    },
    receive(itemId, quantity) {
      receiptNo += 1;
      return db.dataSource.transaction(async (manager) => {
        await db.posting.post(manager, {
          documentType: 'spec_receipt',
          documentId: receiptNo,
          lines: [
            {
              itemId,
              movementType: StockMovementType.RECEIPT,
              quantity,
              unitCost: 1000,
            },
          ],
        });
        return reservations.allocate(manager, [itemId]);
      });
    },
    async reservationsOf(itemId) {
      const rows: Array<{ order_id: number; quantity: string }> =
        await db.dataSource.query(
          `SELECT order_id, trim_scale(quantity)::text AS quantity
             FROM stock_reservations WHERE item_id = $1`,
          [itemId],
        );
      return Object.fromEntries(
        rows.map((row) => [row.order_id, row.quantity]),
      );
    },
    async balanceOf(itemId) {
      const [row]: Array<{ on_hand: string; reserved: string; sum: string }> =
        await db.dataSource.query(
          `SELECT trim_scale(b.on_hand)::text AS on_hand,
                  trim_scale(b.reserved)::text AS reserved,
                  trim_scale(COALESCE((SELECT SUM(quantity) FROM stock_reservations r
                                        WHERE r.item_id = b.item_id), 0))::text AS sum
             FROM stock_balances b WHERE b.item_id = $1`,
          [itemId],
        );
      return { onHand: row.on_hand, reserved: row.reserved, sum: row.sum };
    },
    async cleanup() {
      if (orderIds.length > 0) {
        await db.dataSource.query(
          `DELETE FROM notifications WHERE event_type LIKE 'inventory.order.short%'
             AND (payload->>'orderId')::int = ANY($1)`,
          [orderIds],
        );
        await db.dataSource.query(
          `DELETE FROM stock_reservations WHERE order_id = ANY($1)`,
          [orderIds],
        );
      }
      // Order BOM lines name the items: the orders go before the inventory helper deletes them.
      await orders.cleanup();
    },
  };
}
