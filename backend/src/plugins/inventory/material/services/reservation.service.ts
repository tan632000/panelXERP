import { Injectable, OnModuleInit } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import {
  DEMAND_BEARING_STATUSES,
  MATERIAL_LIFECYCLE_HOOK,
} from '@plugins/inventory/material/constants/material.constant';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import {
  holdingOf,
  loadHoldings,
  shortageOf,
} from '@plugins/inventory/material/utils/order-holdings.util';
import {
  shrinkReservation,
  StockPostingService,
} from '@plugins/inventory/stock/services/stock-posting.service';
import { OrderLifecycleRegistry } from '@plugins/sales/_shared/ports/order-lifecycle-registry';
import {
  OrderMaterialReadPort,
  type OrderItemDemand,
} from '@plugins/sales/_shared/ports/order-material-read.port';

import type { EntityManager } from 'typeorm';

/** The orders whose reservation changed, and the items whose stock was looked at. */
export interface ReservationChange {
  orderIds: number[];
  itemIds: number[];
}

const NONE: ReservationChange = { orderIds: [], itemIds: [] };

const ascending = (ids: Iterable<number>) =>
  [...new Set(ids)].sort((a, b) => a - b);

/**
 * Stock set aside for open orders (D-05). Everything runs on the caller's manager, inside the
 * document's transaction, and locks the balance rows of the items first (D-04) — re-locking a
 * row this transaction already holds is a no-op, so a caller that locked them is fine.
 *
 * Priority when stock is handed out: the preferred orders first, then the earliest delivery
 * date (no date last), then the lowest order id. Shrinking runs in exactly the reverse order.
 */
@Injectable()
export class ReservationService implements OnModuleInit {
  constructor(
    private readonly posting: StockPostingService,
    private readonly orders: OrderMaterialReadPort,
    private readonly lifecycle: OrderLifecycleRegistry,
    private readonly alerts: ShortageAlertService,
  ) {}

  /** A new order takes what it can at once; a cancelled one gives everything back. */
  onModuleInit(): void {
    this.lifecycle.register(MATERIAL_LIFECYCLE_HOOK, {
      onCreated: async (manager, { orderId }) => {
        const change = await this.reserveForOrder(manager, orderId);
        // The new order is evaluated for a shortage even when nothing could be reserved.
        return {
          changedOrderIds: ascending([orderId, ...change.orderIds]),
          touchedItemIds: change.itemIds,
        };
      },
      onCancelled: async (manager, { orderId }) => {
        const change = await this.releaseOrder(manager, orderId);
        return {
          changedOrderIds: ascending([orderId, ...change.orderIds]),
          touchedItemIds: change.itemIds,
        };
      },
      afterCommit: (result) =>
        this.alerts.afterCommit(result.changedOrderIds, result.touchedItemIds),
    });
  }

  /** Per item of the order, ascending: `min(available, shortage)`. */
  async reserveForOrder(
    manager: EntityManager,
    orderId: number,
  ): Promise<ReservationChange> {
    const demands = await this.orders.openDemand(
      manager,
      { orderId },
      DEMAND_BEARING_STATUSES,
    );
    if (demands.length === 0) return NONE;
    const itemIds = ascending(demands.map((demand) => demand.itemId));
    const stock = await this.posting.lockBalances(manager, itemIds);
    const holdings = await loadHoldings(manager, itemIds);

    let changed = false;
    for (const demand of [...demands].sort((a, b) => a.itemId - b.itemId)) {
      const balance = stock.get(demand.itemId);
      if (!balance) continue;
      const available = balance.onHand.sub(balance.reserved);
      const give = Decimal.min(
        available,
        shortageOf(demand.demand, holdingOf(holdings, orderId, demand.itemId)),
      );
      if (give.lessThanOrEqualTo(0)) continue;
      await this.addReservation(manager, orderId, demand.itemId, give);
      balance.reserved = balance.reserved.add(give);
      changed = true;
    }
    await this.syncReserved(manager, itemIds);
    return { orderIds: changed ? [orderId] : [], itemIds };
  }

  /**
   * Gives back everything the order holds, then hands it to the other short orders. The lock
   * covers every linked item of the order as well as every item it reserves: an order short of
   * X with nothing reserved of X must still hold X's row, or a receipt running alongside could
   * allocate X to it after this transaction read its reservations.
   */
  async releaseOrder(
    manager: EntityManager,
    orderId: number,
  ): Promise<ReservationChange> {
    const linked = await this.orders.linkedItemIds(manager, orderId);
    const reservedBefore: Array<{ item_id: number }> = await manager.query(
      `SELECT item_id FROM stock_reservations WHERE order_id = $1`,
      [orderId],
    );
    const itemIds = ascending([
      ...linked,
      ...reservedBefore.map((row) => Number(row.item_id)),
    ]);
    if (itemIds.length === 0) return NONE;
    await this.posting.lockBalances(manager, itemIds);

    // Read again under the locks: an allocation that committed meanwhile is caught here.
    const released: unknown[] = await manager.query(
      `DELETE FROM stock_reservations WHERE order_id = $1 RETURNING item_id`,
      [orderId],
    );
    await this.syncReserved(manager, itemIds);
    const handed = await this.allocate(manager, itemIds);
    return {
      orderIds: ascending([
        ...(released.length > 0 ? [orderId] : []),
        ...handed.orderIds,
      ]),
      itemIds,
    };
  }

  /**
   * Hands the available stock of each item to the open orders short of it, by priority. A
   * caller already holding balance rows passes exactly those items (or fewer): locking more
   * here would take rows out of ascending order.
   */
  async allocate(
    manager: EntityManager,
    itemIds: readonly number[],
    preferOrderIds: readonly number[] = [],
  ): Promise<ReservationChange> {
    const items = ascending(itemIds);
    if (items.length === 0) return NONE;
    const stock = await this.posting.lockBalances(manager, items);
    const demands = await this.orders.openDemand(
      manager,
      { itemIds: items },
      DEMAND_BEARING_STATUSES,
    );
    const holdings = await loadHoldings(manager, items);
    const preferred = new Map(preferOrderIds.map((id, index) => [id, index]));

    const changed = new Set<number>();
    for (const itemId of items) {
      const balance = stock.get(itemId);
      if (!balance) continue;
      let remaining = balance.onHand.sub(balance.reserved);
      if (remaining.lessThanOrEqualTo(0)) continue;

      const candidates = demands
        .filter((demand) => demand.itemId === itemId)
        .map((demand) => ({
          demand,
          short: shortageOf(
            demand.demand,
            holdingOf(holdings, demand.orderId, itemId),
          ),
        }))
        .filter((candidate) => candidate.short.greaterThan(0))
        .sort((a, b) => byPriority(a.demand, b.demand, preferred));

      for (const { demand, short } of candidates) {
        if (remaining.lessThanOrEqualTo(0)) break;
        const give = Decimal.min(remaining, short);
        await this.addReservation(manager, demand.orderId, itemId, give);
        remaining = remaining.sub(give);
        changed.add(demand.orderId);
      }
    }
    await this.syncReserved(manager, items);
    return { orderIds: ascending(changed), itemIds: items };
  }

  /**
   * Shrinks the item's reservations, lowest priority first, until the item's reserved figure
   * is at most `targetReserved` (stock left before it was reserved: a supplier return, a
   * negative count).
   */
  async deallocate(
    manager: EntityManager,
    itemId: number,
    targetReserved: Decimal.Value,
  ): Promise<ReservationChange> {
    const stock = await this.posting.lockBalances(manager, [itemId]);
    const balance = stock.get(itemId);
    if (!balance) return NONE;
    let excess = balance.reserved.sub(targetReserved);
    if (excess.lessThanOrEqualTo(0)) return { orderIds: [], itemIds: [itemId] };

    const held: Array<{ order_id: number; quantity: string }> =
      await manager.query(
        `SELECT order_id, quantity FROM stock_reservations WHERE item_id = $1`,
        [itemId],
      );
    const demands = await this.orders.openDemand(
      manager,
      { itemIds: [itemId] },
      DEMAND_BEARING_STATUSES,
    );
    const byOrder = new Map(demands.map((demand) => [demand.orderId, demand]));
    const reversed = held
      .map((row) => ({
        orderId: Number(row.order_id),
        quantity: new Decimal(row.quantity),
        demand: byOrder.get(Number(row.order_id)),
      }))
      .sort((a, b) =>
        a.demand && b.demand
          ? byPriority(b.demand, a.demand, new Map())
          : // An order that bears no demand any more gives its stock back first.
            Number(Boolean(a.demand)) - Number(Boolean(b.demand)),
      );

    const changed: number[] = [];
    for (const reservation of reversed) {
      if (excess.lessThanOrEqualTo(0)) break;
      const take = Decimal.min(excess, reservation.quantity);
      await shrinkReservation(
        manager,
        reservation.orderId,
        itemId,
        reservation.quantity,
        take,
      );
      excess = excess.sub(take);
      changed.push(reservation.orderId);
    }
    await this.syncReserved(manager, [itemId]);
    return { orderIds: ascending(changed), itemIds: [itemId] };
  }

  private async addReservation(
    manager: EntityManager,
    orderId: number,
    itemId: number,
    quantity: Decimal,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO stock_reservations (order_id, item_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (order_id, item_id)
       DO UPDATE SET quantity = stock_reservations.quantity + EXCLUDED.quantity,
                     updated_at = NOW()`,
      [orderId, itemId, quantity.toFixed()],
    );
  }

  /** Keeps every balance's `reserved` equal to the sum of its reservations. */
  private async syncReserved(
    manager: EntityManager,
    itemIds: readonly number[],
  ): Promise<void> {
    await manager.query(
      `UPDATE stock_balances b
          SET reserved = COALESCE(
                (SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.item_id = b.item_id), 0),
              updated_at = NOW()
        WHERE b.item_id = ANY($1::int[])`,
      [[...itemIds]],
    );
  }
}

/** Preferred first (in the order given), then delivery date (none last), then order id. */
function byPriority(
  a: OrderItemDemand,
  b: OrderItemDemand,
  preferred: Map<number, number>,
): number {
  const pa = preferred.get(a.orderId) ?? Number.POSITIVE_INFINITY;
  const pb = preferred.get(b.orderId) ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  if (a.deliveryDate !== b.deliveryDate) {
    if (a.deliveryDate === null) return 1;
    if (b.deliveryDate === null) return -1;
    return a.deliveryDate < b.deliveryDate ? -1 : 1;
  }
  return a.orderId - b.orderId;
}
