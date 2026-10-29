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

import { DataScopeService } from '@shared/services/data-scope.service';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { SupplierReferenceCheckRegistry } from '@plugins/inventory/_shared/gateways/supplier-reference-check-registry';
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
import { PurchaseOrderController } from '@plugins/inventory/purchase-order/purchase-order.controller';
import { PurchaseOrderApprovalService } from '@plugins/inventory/purchase-order/services/purchase-order-approval.service';
import { PurchaseOrderFromRequestsService } from '@plugins/inventory/purchase-order/services/purchase-order-from-requests.service';
import { PurchaseOrderService } from '@plugins/inventory/purchase-order/services/purchase-order.service';
import { PurchaseRequestController } from '@plugins/inventory/purchase-request/purchase-request.controller';
import { PurchaseRequestReferenceService } from '@plugins/inventory/purchase-request/services/purchase-request-reference.service';
import { PurchaseRequestService } from '@plugins/inventory/purchase-request/services/purchase-request.service';
import { StockReceiptController } from '@plugins/inventory/receipt/receipt.controller';
import { StockReceiptService } from '@plugins/inventory/receipt/services/receipt.service';
import { StockPostingService } from '@plugins/inventory/stock/services/stock-posting.service';
import { SupplierReturnService } from '@plugins/inventory/supplier-return/services/supplier-return.service';
import { SupplierReturnController } from '@plugins/inventory/supplier-return/supplier-return.controller';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

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

export interface PurchaseRequestHarness {
  db: InventoryDb;
  kit: ReservationKit;
  itemChecks: ReferenceCheckRegistry;
  supplierId: number;
  /** A seeded user acting with a role's grants, plus any extra scope. */
  as(username: string, role: string, extra?: string[]): Promise<string>;
  PURCHASING: string;
  DIRECTOR: string;
  STOREKEEPER: string;
  post(token: string, path: string, body?: unknown): request.Test;
  get(token: string, path: string): request.Test;
  patch(token: string, path: string, body: unknown): request.Test;
  /** Remembers a request the cleanup removes. */
  track(requestId: number): void;
  close(): Promise<void>;
}

/**
 * Purchase requests, purchase orders, receipts and supplier returns mounted over the real
 * Postgres of the compose stack, with the guard reading the actor from a header. Named
 * `*.helper-spec.ts` so the build leaves it out and jest does not run it as a test.
 */
export async function openPurchaseRequestHarness(): Promise<PurchaseRequestHarness> {
  const db = await openInventoryDb();
  const kit = reservationKit(db);
  const as = async (username: string, role: string, extra: string[] = []) =>
    JSON.stringify({
      userId: await db.userId(username),
      role,
      permissions: [...(seededRolePermissions(role) ?? []), ...extra],
    });
  const [supplier]: Array<{ id: number }> = await db.dataSource.query(
    `INSERT INTO suppliers (code, name, is_active) VALUES ($1, 'Request spec supplier', true)
     RETURNING id`,
    [`${db.tag}-S`],
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [
      PurchaseRequestController,
      PurchaseOrderController,
      StockReceiptController,
      SupplierReturnController,
    ],
    providers: [
      PurchaseRequestService,
      PurchaseRequestReferenceService,
      PurchaseOrderService,
      PurchaseOrderApprovalService,
      PurchaseOrderFromRequestsService,
      StockReceiptService,
      SupplierReturnService,
      OrderMaterialReadPort,
      DataScopeService,
      ReferenceCheckRegistry,
      SupplierReferenceCheckRegistry,
      {
        provide: NotificationService,
        useValue: new NotificationService(
          db.dataSource.getRepository(Notification),
          null as never,
          null as never,
        ),
      },
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
  const requestIds: number[] = [];

  return {
    db,
    kit,
    itemChecks: moduleRef.get(ReferenceCheckRegistry),
    supplierId: supplier.id,
    as,
    PURCHASING: await as('purchasing', 'purchasing'),
    DIRECTOR: await as('director', 'director'),
    STOREKEEPER: await as('storekeeper', 'storekeeper'),
    post: (token, path, body = {}) =>
      http()
        .post(path)
        .set({ 'x-test-actor': token })
        .send(body as object),
    get: (token, path) => http().get(path).set({ 'x-test-actor': token }),
    patch: (token, path, body) =>
      http()
        .patch(path)
        .set({ 'x-test-actor': token })
        .send(body as object),
    track: (requestId) => requestIds.push(requestId),
    async close() {
      await app.close();
      const orders = `SELECT id FROM purchase_orders WHERE supplier_id = $1`;
      await db.dataSource.query(
        `DELETE FROM notifications WHERE event_type LIKE 'inventory.purchase_order.%'
           AND (payload->>'purchaseOrderId')::int IN (${orders})`,
        [supplier.id],
      );
      for (const table of ['stock_supplier_returns', 'stock_receipts']) {
        await db.dataSource.query(
          `DELETE FROM ${table} WHERE purchase_order_id IN (${orders})`,
          [supplier.id],
        );
      }
      await db.dataSource.query(
        `DELETE FROM purchase_orders WHERE supplier_id = $1`,
        [supplier.id],
      );
      // Requests of this run: tracked ones and any naming one of its items.
      await db.dataSource.query(
        `DELETE FROM purchase_requests WHERE id = ANY($1::int[])
            OR id IN (SELECT l.request_id FROM purchase_request_lines l
                        JOIN items i ON i.id = l.item_id WHERE i.code LIKE $2)`,
        [requestIds, `${db.tag}-%`],
      );
      await db.dataSource.query(`DELETE FROM suppliers WHERE id = $1`, [
        supplier.id,
      ]);
      await kit.cleanup();
      await db.close();
    },
  };
}
