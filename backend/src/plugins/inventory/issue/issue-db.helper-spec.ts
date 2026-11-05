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

import {
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { StockIssueController } from '@plugins/inventory/issue/issue.controller';
import { StockIssueService } from '@plugins/inventory/issue/services/issue.service';
import { OrderStockDocumentReader } from '@plugins/inventory/issue/services/order-stock-document.reader';
import { WorkshopReturnService } from '@plugins/inventory/issue/services/workshop-return.service';
import { WorkshopReturnController } from '@plugins/inventory/issue/workshop-return.controller';
import {
  reservationKit,
  type ReservationKit,
} from '@plugins/inventory/material/reservation-db.helper-spec';
import { ReservationService } from '@plugins/inventory/material/services/reservation.service';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import { StockPostingService } from '@plugins/inventory/stock/services/stock-posting.service';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { OrderFollowerNotifier } from '@plugins/sales/_shared/services/order-follower-notifier';

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

export interface DocumentLineBody {
  itemId: number;
  quantity: number;
  orderLineId?: number;
  reason?: string;
  note?: string;
}

export interface IssueHarness {
  db: InventoryDb;
  kit: ReservationKit;
  app: INestApplication<App>;
  STOREKEEPER: string;
  PURCHASING: string;
  /** Opening stock of the item at the given unit cost, as a receipt would post it. */
  stockOf(itemId: number, quantity: string, unitCost: number): Promise<void>;
  /** A receipt and the allocation it triggers, in one transaction (the task-11 path). */
  receive(itemId: number, quantity: string, unitCost: number): Promise<void>;
  issue(
    orderId: number,
    lines: DocumentLineBody[],
    options?: { token?: string; requestKey?: string },
  ): request.Test;
  workshopReturn(
    orderId: number,
    lines: DocumentLineBody[],
    options?: { token?: string; requestKey?: string },
  ): request.Test;
  get(path: string, token?: string): request.Test;
  /** What the order still has out at the workshop of the item, as exact numeric text. */
  netIssued(orderId: number, itemId: number): Promise<string>;
  /** Movements of the order's issues and returns of the item. */
  movementCount(orderId: number, itemId: number): Promise<number>;
  close(): Promise<void>;
}

/**
 * The issue and workshop return endpoints mounted over the real Postgres of the compose stack,
 * with the reservation and alert services they call, the material data scope, and the guard
 * reading the actor from a header. Orders come from the reservation kit. Named
 * `*.helper-spec.ts` so the build leaves it out and jest does not run it as a test.
 */
export async function openIssueHarness(): Promise<IssueHarness> {
  const db = await openInventoryDb();
  const kit = reservationKit(db);
  const actor = (userId: number, role: string) =>
    JSON.stringify({ userId, role, permissions: seededRolePermissions(role) });
  const STOREKEEPER = actor(await db.userId('storekeeper'), 'storekeeper');
  const PURCHASING = actor(await db.userId('purchasing'), 'purchasing');
  // Emit uses only the notification table.
  const notifications = new NotificationService(
    db.dataSource.getRepository(Notification),
    null as never,
    null as never,
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [StockIssueController, WorkshopReturnController],
    providers: [
      StockIssueService,
      WorkshopReturnService,
      OrderStockDocumentReader,
      OrderMaterialReadPort,
      OrderFollowerNotifier,
      DataScopeService,
      { provide: NotificationService, useValue: notifications },
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

  let openingNo = 0;
  const post = (
    path: string,
    orderId: number,
    lines: DocumentLineBody[],
    options: { token?: string; requestKey?: string } = {},
  ) =>
    request(app.getHttpServer())
      .post(path)
      .set({ 'x-test-actor': options.token ?? STOREKEEPER })
      .send({
        orderId,
        lines,
        ...(options.requestKey ? { requestKey: options.requestKey } : {}),
      });
  const receiptLine = (itemId: number, quantity: string, unitCost: number) => {
    openingNo += 1;
    return {
      documentType: 'spec_receipt',
      documentId: openingNo,
      lines: [
        {
          itemId,
          movementType: StockMovementType.RECEIPT as const,
          quantity,
          unitCost,
        },
      ],
    };
  };

  return {
    db,
    kit,
    app,
    STOREKEEPER,
    PURCHASING,
    async stockOf(itemId, quantity, unitCost) {
      await db.post(receiptLine(itemId, quantity, unitCost));
    },
    async receive(itemId, quantity, unitCost) {
      await db.dataSource.transaction(async (manager) => {
        await db.posting.post(manager, receiptLine(itemId, quantity, unitCost));
        await kit.reservations.allocate(manager, [itemId]);
      });
    },
    issue: (orderId, lines, options) =>
      post('/inventory/issues', orderId, lines, options),
    workshopReturn: (orderId, lines, options) =>
      post('/inventory/workshop-returns', orderId, lines, options),
    get: (path, token) =>
      request(app.getHttpServer())
        .get(path)
        .set({ 'x-test-actor': token ?? STOREKEEPER }),
    async netIssued(orderId, itemId) {
      const [row]: Array<{ net: string }> = await db.dataSource.query(
        `SELECT trim_scale(COALESCE(-SUM(quantity), 0))::text AS net
           FROM stock_movements
          WHERE order_id = $1 AND item_id = $2
            AND movement_type IN ('issue', 'workshop_return')`,
        [orderId, itemId],
      );
      return row.net;
    },
    async movementCount(orderId, itemId) {
      const [row]: Array<{ count: string }> = await db.dataSource.query(
        `SELECT COUNT(*) AS count FROM stock_movements
          WHERE order_id = $1 AND item_id = $2
            AND movement_type IN ('issue', 'workshop_return')`,
        [orderId, itemId],
      );
      return Number(row.count);
    },
    async close() {
      await app.close();
      const orderIds: Array<{ order_id: number }> = await db.dataSource.query(
        `SELECT DISTINCT order_id FROM stock_movements
          WHERE item_id IN (SELECT id FROM items WHERE code LIKE $1)
            AND order_id IS NOT NULL`,
        [`${db.tag}-%`],
      );
      const ids = orderIds.map((row) => row.order_id);
      // Lines go with their document; the movements go with the items.
      await db.dataSource.query(
        `DELETE FROM stock_issues WHERE order_id = ANY($1::int[])`,
        [ids],
      );
      await db.dataSource.query(
        `DELETE FROM stock_workshop_returns WHERE order_id = ANY($1::int[])`,
        [ids],
      );
      await db.dataSource.query(
        `DELETE FROM notifications WHERE event_type = 'sales.order.updated'
            AND (payload->>'orderId')::int = ANY($1::int[])`,
        [ids],
      );
      await kit.cleanup();
      await db.close();
    },
  };
}
