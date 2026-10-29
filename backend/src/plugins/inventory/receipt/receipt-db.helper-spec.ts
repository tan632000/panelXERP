import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Notification } from '@kernel/core/audit/notification.entity';
import { NotificationService } from '@kernel/core/audit/notification.service';
import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';

import {
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import {
  reservationKit,
  type ReservationKit,
} from '@plugins/inventory/material/reservation-db.helper-spec';
import { ReservationService } from '@plugins/inventory/material/services/reservation.service';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import { StockReceiptController } from '@plugins/inventory/receipt/receipt.controller';
import { StockReceiptService } from '@plugins/inventory/receipt/services/receipt.service';
import { StockPostingService } from '@plugins/inventory/stock/services/stock-posting.service';

import type { App } from 'supertest/types';

/** Stands in for the JWT guard: the actor travels in a header instead of a token. */
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    req.user = JSON.parse(req.headers['x-test-actor']) as unknown;
    return true;
  }
}

export interface PurchaseOrderLineSpec {
  itemId: number;
  quantity: string;
  unitPrice: number;
  sourceOrderId?: number | null;
}

export interface ReceiptLineBody {
  poLineId: number;
  quantity: number;
}

export interface ReceiptHarness {
  db: InventoryDb;
  kit: ReservationKit;
  app: INestApplication<App>;
  STOREKEEPER: string;
  PURCHASING: string;
  /** A purchase order written straight to the tables, `approved` unless told otherwise. */
  createPurchaseOrder(
    lines: PurchaseOrderLineSpec[],
    status?: string,
  ): Promise<{ id: number; lineIds: number[] }>;
  receive(
    purchaseOrderId: number,
    lines: ReceiptLineBody[],
    options?: { token?: string; requestKey?: string },
  ): request.Test;
  /** The order's status and each line's received quantity, as exact numeric text. */
  orderState(
    purchaseOrderId: number,
  ): Promise<{ status: string; received: string[] }>;
  /** Receipts stored for the order, and their stock movements. */
  documentsOf(
    purchaseOrderId: number,
  ): Promise<{ receipts: number; movements: number }>;
  close(): Promise<void>;
}

/**
 * The receipt endpoints mounted over the real Postgres of the compose stack, with the
 * reservation and alert services they call and the guard reading the actor from a header.
 * Purchase orders and their supplier are written straight to the tables. Named
 * `*.helper-spec.ts` so the build leaves it out and jest does not run it as a test.
 */
export async function openReceiptHarness(): Promise<ReceiptHarness> {
  const db = await openInventoryDb();
  const kit = reservationKit(db);
  const actor = (userId: number, role: string) =>
    JSON.stringify({ userId, role, permissions: seededRolePermissions(role) });
  const STOREKEEPER = actor(await db.userId('storekeeper'), 'storekeeper');
  const PURCHASING_ID = await db.userId('purchasing');
  const PURCHASING = actor(PURCHASING_ID, 'purchasing');

  const [supplier]: Array<{ id: number }> = await db.dataSource.query(
    `INSERT INTO suppliers (code, name, is_active) VALUES ($1, 'Receipt spec supplier', true)
     RETURNING id`,
    [`${db.tag}-S`],
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [StockReceiptController],
    providers: [
      StockReceiptService,
      { provide: StockPostingService, useValue: db.posting },
      { provide: ReservationService, useValue: kit.reservations },
      { provide: ShortageAlertService, useValue: kit.alerts },
      {
        provide: NotificationService,
        useValue: new NotificationService(
          db.dataSource.getRepository(Notification),
          null as never,
          null as never,
        ),
      },
      { provide: DataSource, useValue: db.dataSource },
      { provide: APP_GUARD, useClass: HeaderAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  let orderNo = 0;
  return {
    db,
    kit,
    app,
    STOREKEEPER,
    PURCHASING,
    async createPurchaseOrder(lines, status = 'approved') {
      orderNo += 1;
      const [order]: Array<{ id: number }> = await db.dataSource.query(
        `INSERT INTO purchase_orders (code, supplier_id, vat_rate, status, created_by)
         VALUES ($1, $2, 10, $3, $4) RETURNING id`,
        [`${db.tag}-PO${orderNo}`, supplier.id, status, PURCHASING_ID],
      );
      const lineIds: number[] = [];
      for (const [index, line] of lines.entries()) {
        const [row]: Array<{ id: number }> = await db.dataSource.query(
          `INSERT INTO purchase_order_lines
             (purchase_order_id, line_no, item_id, item_code, item_name, item_unit,
              quantity, unit_price, amount, source_order_id)
           SELECT $1, $2, i.id, i.code, i.name, i.unit, $4::numeric, $5::numeric,
                  round($4::numeric * $5::numeric), $6
             FROM items i WHERE i.id = $3
           RETURNING id`,
          [
            order.id,
            index + 1,
            line.itemId,
            line.quantity,
            line.unitPrice,
            line.sourceOrderId ?? null,
          ],
        );
        lineIds.push(row.id);
      }
      return { id: order.id, lineIds };
    },
    receive(purchaseOrderId, lines, options = {}) {
      return request(app.getHttpServer())
        .post('/inventory/receipts')
        .set({ 'x-test-actor': options.token ?? STOREKEEPER })
        .send({
          purchaseOrderId,
          lines,
          ...(options.requestKey ? { requestKey: options.requestKey } : {}),
        });
    },
    async orderState(purchaseOrderId) {
      const [order]: Array<{ status: string }> = await db.dataSource.query(
        `SELECT status FROM purchase_orders WHERE id = $1`,
        [purchaseOrderId],
      );
      const lines: Array<{ received: string }> = await db.dataSource.query(
        `SELECT trim_scale(received_qty)::text AS received
           FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY line_no`,
        [purchaseOrderId],
      );
      return {
        status: order.status,
        received: lines.map((line) => line.received),
      };
    },
    async documentsOf(purchaseOrderId) {
      const [row]: Array<{ receipts: string; movements: string }> =
        await db.dataSource.query(
          `SELECT (SELECT COUNT(*) FROM stock_receipts WHERE purchase_order_id = $1) AS receipts,
                  (SELECT COUNT(*) FROM stock_movements m
                     JOIN stock_receipts r ON r.id = m.document_id
                    WHERE m.document_type = 'stock_receipt' AND r.purchase_order_id = $1)
                    AS movements`,
          [purchaseOrderId],
        );
      return {
        receipts: Number(row.receipts),
        movements: Number(row.movements),
      };
    },
    async close() {
      await app.close();
      await kit.cleanup();
      // Receipt lines go with their receipt; the movements go with the items.
      await db.dataSource.query(
        `DELETE FROM stock_receipts WHERE purchase_order_id IN
           (SELECT id FROM purchase_orders WHERE supplier_id = $1)`,
        [supplier.id],
      );
      await db.dataSource.query(
        `DELETE FROM purchase_orders WHERE supplier_id = $1`,
        [supplier.id],
      );
      await db.dataSource.query(`DELETE FROM suppliers WHERE id = $1`, [
        supplier.id,
      ]);
      await db.close();
    },
  };
}
