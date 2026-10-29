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
import { StockAvailabilityService } from '@plugins/inventory/stock/services/stock-availability.service';
import { StockPostingService } from '@plugins/inventory/stock/services/stock-posting.service';
import { StockQueryService } from '@plugins/inventory/stock/services/stock-query.service';
import { StockController } from '@plugins/inventory/stock/stock.controller';
import { SupplierReturnService } from '@plugins/inventory/supplier-return/services/supplier-return.service';
import { SupplierReturnController } from '@plugins/inventory/supplier-return/supplier-return.controller';

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

export interface PurchaseLineSpec {
  itemId: number;
  quantity: string;
  unitPrice: number;
  /** Received already, written straight to the line (a fixture shortcut). */
  receivedQty?: string;
}

export interface SupplierReturnHarness {
  db: InventoryDb;
  kit: ReservationKit;
  STOREKEEPER: string;
  PURCHASING: string;
  createPurchaseOrder(
    lines: PurchaseLineSpec[],
    status?: string,
  ): Promise<{ id: number; lineIds: number[] }>;
  /** The task-11 receipt over HTTP. */
  receive(
    purchaseOrderId: number,
    lines: Array<{ poLineId: number; quantity: number }>,
  ): request.Test;
  returnToSupplier(
    purchaseOrderId: number,
    lines: Array<{ poLineId: number; quantity: number }>,
    options?: { token?: string; requestKey?: string; reason?: string },
  ): request.Test;
  get(path: string, token?: string): request.Test;
  orderState(
    purchaseOrderId: number,
  ): Promise<{ status: string; received: string[] }>;
  /** Supplier returns stored for the order, and their stock movements. */
  documentsOf(
    purchaseOrderId: number,
  ): Promise<{ returns: number; movements: number }>;
  close(): Promise<void>;
}

/**
 * The supplier return, receipt and stock ledger endpoints over the real Postgres of the compose
 * stack, with the reservation and alert services they call and the guard reading the actor
 * from a header. Purchase orders and their supplier are written straight to the tables. Named
 * `*.helper-spec.ts` so the build leaves it out and jest does not run it as a test.
 */
export async function openSupplierReturnHarness(): Promise<SupplierReturnHarness> {
  const db = await openInventoryDb();
  const kit = reservationKit(db);
  const actor = (userId: number, role: string) =>
    JSON.stringify({ userId, role, permissions: seededRolePermissions(role) });
  const STOREKEEPER = actor(await db.userId('storekeeper'), 'storekeeper');
  const PURCHASING_ID = await db.userId('purchasing');
  const PURCHASING = actor(PURCHASING_ID, 'purchasing');
  const [supplier]: Array<{ id: number }> = await db.dataSource.query(
    `INSERT INTO suppliers (code, name, is_active) VALUES ($1, 'Return spec supplier', true)
     RETURNING id`,
    [`${db.tag}-S`],
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [
      SupplierReturnController,
      StockReceiptController,
      StockController,
    ],
    providers: [
      SupplierReturnService,
      StockReceiptService,
      StockQueryService,
      StockAvailabilityService,
      { provide: StockPostingService, useValue: db.posting },
      { provide: ReservationService, useValue: kit.reservations },
      { provide: ShortageAlertService, useValue: kit.alerts },
      { provide: DataSource, useValue: db.dataSource },
      { provide: APP_GUARD, useClass: HeaderAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const http = () => request(app.getHttpServer());

  let orderNo = 0;
  return {
    db,
    kit,
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
              quantity, unit_price, amount, received_qty)
           SELECT $1, $2, i.id, i.code, i.name, i.unit, $4::numeric, $5::numeric,
                  round($4::numeric * $5::numeric), $6::numeric
             FROM items i WHERE i.id = $3
           RETURNING id`,
          [
            order.id,
            index + 1,
            line.itemId,
            line.quantity,
            line.unitPrice,
            line.receivedQty ?? '0',
          ],
        );
        lineIds.push(row.id);
      }
      return { id: order.id, lineIds };
    },
    receive: (purchaseOrderId, lines) =>
      http()
        .post('/inventory/receipts')
        .set({ 'x-test-actor': STOREKEEPER })
        .send({ purchaseOrderId, lines }),
    returnToSupplier: (purchaseOrderId, lines, options = {}) =>
      http()
        .post('/inventory/supplier-returns')
        .set({ 'x-test-actor': options.token ?? STOREKEEPER })
        .send({
          purchaseOrderId,
          reason: options.reason ?? 'Hàng lỗi',
          lines,
          ...(options.requestKey ? { requestKey: options.requestKey } : {}),
        }),
    get: (path, token) =>
      http()
        .get(path)
        .set({ 'x-test-actor': token ?? STOREKEEPER }),
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
      const [row]: Array<{ returns: string; movements: string }> =
        await db.dataSource.query(
          `SELECT (SELECT COUNT(*) FROM stock_supplier_returns WHERE purchase_order_id = $1)
                    AS returns,
                  (SELECT COUNT(*) FROM stock_movements m
                     JOIN stock_supplier_returns r ON r.id = m.document_id
                    WHERE m.document_type = 'stock_supplier_return'
                      AND r.purchase_order_id = $1) AS movements`,
          [purchaseOrderId],
        );
      return { returns: Number(row.returns), movements: Number(row.movements) };
    },
    async close() {
      await app.close();
      await kit.cleanup();
      const orders = `SELECT id FROM purchase_orders WHERE supplier_id = $1`;
      // Lines go with their document; the movements go with the items.
      await db.dataSource.query(
        `DELETE FROM stock_supplier_returns WHERE purchase_order_id IN (${orders})`,
        [supplier.id],
      );
      await db.dataSource.query(
        `DELETE FROM stock_receipts WHERE purchase_order_id IN (${orders})`,
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
