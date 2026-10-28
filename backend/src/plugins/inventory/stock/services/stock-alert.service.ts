import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';

import { isPostgresUniqueViolation } from '@shared/utils/db-error.util';

import { STOCK_READ } from '@plugins/inventory/stock/permissions/stock.permissions';

export const STOCK_LOW_EVENT = 'inventory.stock.low';
const PURCHASING_ROLE = 'purchasing';

interface ItemAvailability {
  id: number;
  code: string;
  name: string;
  unit: string;
  min_stock: string | null;
  available: string;
  low: boolean;
}

/**
 * Low-stock notices to purchasing. Runs after the posting commits: a notice is never part of
 * the stock change, and a failed one must not undo it. One open notice per item (dedupe
 * `item:<id>`); when the item recovers its dedupe slot is released, so the notice stays in the
 * bell until read while a later drop raises a fresh one.
 */
@Injectable()
export class StockAlertService {
  private readonly logger = new Logger(StockAlertService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  async afterCommit(itemIds: readonly number[]): Promise<void> {
    if (itemIds.length === 0) return;
    let rows: ItemAvailability[];
    try {
      // Compared in SQL numeric, never as JS floats.
      rows = await this.dataSource.query(
        `SELECT i.id, i.code, i.name, i.unit, i.min_stock,
                COALESCE(b.on_hand, 0) - COALESCE(b.reserved, 0) AS available,
                (i.is_deleted = false AND i.min_stock IS NOT NULL
                 AND COALESCE(b.on_hand, 0) - COALESCE(b.reserved, 0) < i.min_stock) AS low
         FROM items i
         LEFT JOIN stock_balances b ON b.item_id = i.id
         WHERE i.id = ANY($1::int[])
         ORDER BY i.id`,
        [[...new Set(itemIds)]],
      );
    } catch (error: unknown) {
      this.logFailure('read the stock of', itemIds.join(', '), error);
      return;
    }

    for (const row of rows) {
      try {
        if (row.low) await this.raise(row);
        else await this.release(row.id);
      } catch (error: unknown) {
        this.logFailure('update the low-stock notice of', row.code, error);
      }
    }
  }

  private async raise(item: ItemAvailability): Promise<void> {
    const dedupeKey = dedupeKeyOf(item.id);
    if (
      await this.notifications.findOpenByDedupeKey(STOCK_LOW_EVENT, dedupeKey)
    ) {
      return;
    }
    try {
      await this.notifications.emit({
        eventType: STOCK_LOW_EVENT,
        roleCodes: [PURCHASING_ROLE],
        // The bell phrases the event from the payload; the text is the fallback.
        message: `${item.code} — ${item.name}`,
        requiredScope: STOCK_READ,
        link: '/inventory/stock',
        dedupeKey,
        payload: {
          itemId: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit,
          available: Number(item.available),
          minStock: Number(item.min_stock),
        },
      });
    } catch (error: unknown) {
      // A concurrent posting raised the same notice first: that one stands.
      if (!isPostgresUniqueViolation(error)) throw error;
    }
  }

  private async release(itemId: number): Promise<void> {
    await this.notifications.releaseDedupeKey({
      eventType: STOCK_LOW_EVENT,
      dedupeKey: dedupeKeyOf(itemId),
    });
  }

  private logFailure(action: string, subject: string, error: unknown): void {
    this.logger.error(
      `Could not ${action} item ${subject}`,
      error instanceof Error ? error.stack : String(error),
    );
  }
}

function dedupeKeyOf(itemId: number): string {
  return `item:${itemId}`;
}
