import { randomBytes } from 'crypto';

import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

import { Notification } from '@kernel/core/audit/notification.entity';

import { PurchaseOrderEvent } from '@plugins/inventory/purchase-order/entities/purchase-order-event.entity';
import { PurchaseOrderLine } from '@plugins/inventory/purchase-order/entities/purchase-order-line.entity';
import { PurchaseOrder } from '@plugins/inventory/purchase-order/entities/purchase-order.entity';
import { StockBalance } from '@plugins/inventory/stock/entities/stock-balance.entity';
import { StockMovement } from '@plugins/inventory/stock/entities/stock-movement.entity';
import { StockReservation } from '@plugins/inventory/stock/entities/stock-reservation.entity';
import {
  StockPostingService,
  type StockPostingRequest,
  type StockPostingResult,
} from '@plugins/inventory/stock/services/stock-posting.service';
import { Supplier } from '@plugins/inventory/supplier/entities/supplier.entity';

/**
 * Wiring shared by the inventory specs that run against the real Postgres of the compose
 * stack. An unreachable database fails the suite; `SKIP_DB_SPECS=1` is the one explicit
 * opt-out, and then jest reports these as skipped. Items get a per-run code prefix and every
 * row a spec creates is deleted by `close`. Named `*.helper-spec.ts` so the production build
 * leaves it out and jest does not run it as a test.
 */
export const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

export interface ItemSpec {
  minStock?: number | string | null;
  referencePrice?: number | null;
}

export interface LedgerTotals {
  onHand: string;
  value: string;
  movementQuantity: string;
  movementValue: string;
}

export interface InventoryDb {
  dataSource: DataSource;
  posting: StockPostingService;
  /** Code prefix of this run's items. */
  tag: string;
  createItem(spec?: ItemSpec): Promise<number>;
  /** One posting in its own transaction, as a document would run it. */
  post(request: StockPostingRequest): Promise<StockPostingResult>;
  /** The balance next to the sums of the item's movements, as `numeric` text. */
  totals(itemId: number): Promise<LedgerTotals>;
  userId(username: string): Promise<number>;
  close(): Promise<void>;
}

export async function openInventoryDb(): Promise<InventoryDb> {
  const tag = `ST${randomBytes(4).toString('hex')}`;
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [
      StockBalance,
      StockMovement,
      StockReservation,
      Notification,
      Supplier,
      PurchaseOrder,
      PurchaseOrderLine,
      PurchaseOrderEvent,
    ],
    // Race specs run many transactions at once; the default pool of 10 would queue them.
    extra: { max: 25 },
  });
  try {
    await dataSource.initialize();
  } catch (error: unknown) {
    throw new Error(
      `Postgres is unreachable (${error instanceof Error ? error.message : String(error)}). Run inside the compose backend container, or set SKIP_DB_SPECS=1 to skip these checks.`,
    );
  }

  const posting = new StockPostingService();
  const itemIds: number[] = [];

  return {
    dataSource,
    posting,
    tag,
    async createItem(spec = {}) {
      const [row]: Array<{ id: number }> = await dataSource.query(
        `INSERT INTO items (code, name, item_group, unit, reference_price, min_stock)
         VALUES ($1, 'Stock spec item', 'other', 'Cái', $2, $3) RETURNING id`,
        [
          `${tag}-${itemIds.length + 1}`,
          spec.referencePrice ?? null,
          spec.minStock ?? null,
        ],
      );
      itemIds.push(row.id);
      return row.id;
    },
    post(request) {
      return dataSource.transaction((manager) =>
        posting.post(manager, request),
      );
    },
    async totals(itemId) {
      const [row]: LedgerTotals[] = await dataSource.query(
        `SELECT COALESCE(b.on_hand, 0)::text AS "onHand",
                COALESCE(b.value, 0)::text AS value,
                COALESCE((SELECT SUM(quantity) FROM stock_movements WHERE item_id = $1), 0)::text
                  AS "movementQuantity",
                COALESCE((SELECT SUM(value) FROM stock_movements WHERE item_id = $1), 0)::text
                  AS "movementValue"
         FROM (SELECT $1::int AS item_id) x
         LEFT JOIN stock_balances b ON b.item_id = x.item_id`,
        [itemId],
      );
      return row;
    },
    async userId(username) {
      const [row]: Array<{ id: number }> = await dataSource.query(
        `SELECT id FROM users WHERE username = $1`,
        [username],
      );
      if (!row) {
        throw new Error(
          `The seeded ${username} account is missing: run \`npm run seed\`.`,
        );
      }
      return row.id;
    },
    async close() {
      if (!dataSource.isInitialized) return;
      if (itemIds.length > 0) {
        await dataSource.query(
          `DELETE FROM notifications WHERE event_type LIKE 'inventory.%'
             AND (payload->>'itemId')::int = ANY($1)`,
          [itemIds],
        );
        for (const table of [
          'stock_reservations',
          'stock_movements',
          'stock_balances',
        ]) {
          await dataSource.query(
            `DELETE FROM ${table} WHERE item_id = ANY($1)`,
            [itemIds],
          );
        }
        await dataSource.query(`DELETE FROM items WHERE id = ANY($1)`, [
          itemIds,
        ]);
      }
      await dataSource.destroy();
    },
  };
}

/** Asserts the ledger invariants of one item: Σ movement values = value, Σ quantities = on hand. */
export async function expectLedgerBalanced(
  db: InventoryDb,
  itemId: number,
): Promise<void> {
  const totals = await db.totals(itemId);
  const exact = (text: string) => new Decimal(text).toFixed();
  expect(exact(totals.movementValue)).toBe(exact(totals.value));
  expect(exact(totals.movementQuantity)).toBe(exact(totals.onHand));
}
