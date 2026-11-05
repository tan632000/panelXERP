import { randomBytes } from 'crypto';

import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  type ModuleMetadata,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { NotificationRead } from '@kernel/core/audit/notification-read.entity';
import { Notification } from '@kernel/core/audit/notification.entity';
import {
  NotificationService,
  type NotificationView,
} from '@kernel/core/audit/notification.service';
import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';
import { Role } from '@kernel/core/users/entities/role.entity';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';

import { DataScopeService } from '@shared/services/data-scope.service';

import { shortageKit } from '@plugins/inventory/_shared/order-shortage.helper-spec';
import { OrderShortagePort } from '@plugins/inventory/_shared/ports/order-shortage.port';
import { ProductionOrderEvent } from '@plugins/production/production-order/entities/production-order-event.entity';
import { ProductionOrder } from '@plugins/production/production-order/entities/production-order.entity';
import { ProductionUnitStage } from '@plugins/production/production-order/entities/production-unit-stage.entity';
import { ProductionUnit } from '@plugins/production/production-order/entities/production-unit.entity';
import { ProductionOrderController } from '@plugins/production/production-order/production-order.controller';
import { ProductionOrderNotifier } from '@plugins/production/production-order/services/production-order-notifier.service';
import { ProductionOrderQueryService } from '@plugins/production/production-order/services/production-order-query.service';
import { ProductionOrderReleaseService } from '@plugins/production/production-order/services/production-order-release.service';
import { ProductionOrderUnitService } from '@plugins/production/production-order/services/production-order-unit.service';
import { ProductionOrderService } from '@plugins/production/production-order/services/production-order.service';
import { OrderLifecycleRegistry } from '@plugins/sales/_shared/ports/order-lifecycle-registry';
import { orderMaterialFixture } from '@plugins/sales/_shared/ports/order-material-fixture.helper-spec';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';
import { OrderFollowerNotifier } from '@plugins/sales/_shared/services/order-follower-notifier';
import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';

import type { FixtureBomLine } from '@plugins/sales/_shared/ports/order-material-fixture.helper-spec';
import type { App } from 'supertest/types';

/**
 * Wiring shared by the production specs that run against the real Postgres of the compose
 * stack. An unreachable database fails the suite; `SKIP_DB_SPECS=1` is the one explicit
 * opt-out, and then jest reports these as skipped. Needs the seeded demo accounts. Named
 * `*.helper-spec.ts` so the production build leaves it out and jest does not run it as a test.
 */
export const describeWithDatabase =
  process.env.SKIP_DB_SPECS === '1' ? describe.skip : describe;

/** An entity class, as TypeORM takes it in a data source. */
export type EntityClass = new (...args: never[]) => object;

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

/** The seeded accounts the specs act as. */
const ACTORS = {
  manager: { username: 'production_manager', role: 'productionManager' },
  techA: { username: 'technician_a', role: 'technician' },
  techB: { username: 'technician_b', role: 'technician' },
  salesA: { username: 'sales_a', role: 'sales' },
  salesB: { username: 'sales_b', role: 'sales' },
  storekeeper: { username: 'storekeeper', role: 'storekeeper' },
  purchasing: { username: 'purchasing', role: 'purchasing' },
  salesMgr: { username: 'sales_mgr', role: 'salesManager' },
  director: { username: 'director', role: 'director' },
  admin: { username: 'admin', role: 'admin' },
} as const;

export type ActorName = keyof typeof ACTORS;

export interface ActorIdentity {
  userId: number;
  role: string;
  permissions: string[];
}

export interface PanelSpec {
  tag: string;
  quantity: number;
  /** Per panel; none by default. */
  bomLines?: FixtureBomLine[];
}

export interface ProductionHarness {
  dataSource: DataSource;
  app: INestApplication<App>;
  lifecycle: OrderLifecycleRegistry;
  notifications: NotificationService;
  /** Identity of each seeded actor, as the guard would put it on the request. */
  actors: Record<ActorName, ActorIdentity>;
  /** The header token of an actor, for the HTTP helpers. */
  token(name: ActorName): string;
  /** An order written straight to the sales tables; panels default to one MSB-01. */
  newOrder(spec?: {
    owner?: string;
    status?: string;
    panels?: PanelSpec[];
  }): Promise<number>;
  get(path: string, as?: ActorName): request.Test;
  post(path: string, body: object, as?: ActorName): request.Test;
  patch(path: string, body: object, as?: ActorName): request.Test;
  /** A catalog item for an order's BOM; removed on close. */
  createItem(): Promise<{ id: number; code: string }>;
  /** A draft production order for the order, created by the manager. */
  createProduction(orderId: number, as?: ActorName): request.Test;
  /** PATCH of one cabinet. */
  assign(
    productionOrderId: number,
    unitId: number,
    body: { assigneeId?: number; plannedEndDate?: string },
    as?: ActorName,
  ): request.Test;
  /** Assigns every unit to the technician and dates it, as a manager preparing a release. */
  prepare(productionOrderId: number, technician?: ActorName): Promise<void>;
  /** Unit rows of a production order, by id. */
  units(
    productionOrderId: number,
  ): Promise<Array<{ id: number; code: string; assignee_id: number | null }>>;
  statusOfOrder(orderId: number): Promise<string>;
  statusOfProduction(productionOrderId: number): Promise<string>;
  /** What the actor reads through their notification list about one sales order. */
  notices(as: ActorName, orderId: number): Promise<NotificationView[]>;
  close(): Promise<void>;
}

export const ASSIGNED_DATE = '2031-12-31';

export async function openProductionHarness(
  foreignEntities: EntityClass[],
  /** A feature under test beside the production order controller. */
  extras: Pick<ModuleMetadata, 'controllers' | 'providers'> = {},
): Promise<ProductionHarness> {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [
      ProductionOrder,
      ProductionUnit,
      ProductionUnitStage,
      ProductionOrderEvent,
      Notification,
      NotificationRead,
      User,
      Role,
      UserRole,
      ...foreignEntities,
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

  const fixture = orderMaterialFixture(dataSource);
  const orderIds: number[] = [];
  const itemIds: number[] = [];

  const actors = {} as Record<ActorName, ActorIdentity>;
  for (const [name, spec] of Object.entries(ACTORS)) {
    actors[name as ActorName] = {
      userId: await fixture.userId(spec.username),
      role: spec.role,
      permissions: seededRolePermissions(spec.role) ?? [],
    };
  }
  const token = (name: ActorName) => JSON.stringify(actors[name]);

  const lifecycle = new OrderLifecycleRegistry();
  const notifications = new NotificationService(
    dataSource.getRepository(Notification),
    dataSource.getRepository(NotificationRead),
    dataSource.getRepository(UserRole),
  );
  const moduleRef = await Test.createTestingModule({
    controllers: [ProductionOrderController, ...(extras.controllers ?? [])],
    providers: [
      ProductionOrderService,
      ProductionOrderQueryService,
      ProductionOrderReleaseService,
      ProductionOrderUnitService,
      ProductionOrderNotifier,
      OrderFollowerNotifier,
      ...(extras.providers ?? []),
      OrderProductionPort,
      OrderMaterialReadPort,
      { provide: OrderShortagePort, useValue: shortageKit(dataSource).port },
      SalesUserLookup,
      DataScopeService,
      {
        provide: getRepositoryToken(User),
        useValue: dataSource.getRepository(User),
      },
      { provide: OrderLifecycleRegistry, useValue: lifecycle },
      { provide: NotificationService, useValue: notifications },
      { provide: DataSource, useValue: dataSource },
      { provide: APP_GUARD, useClass: HeaderAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const http = (as: ActorName | undefined) => ({
    'x-test-actor': token(as ?? 'manager'),
  });
  const harness: ProductionHarness = {
    dataSource,
    app,
    lifecycle,
    notifications,
    actors,
    token,
    async newOrder(spec = {}) {
      const orderId = await fixture.createOrder({
        ownerUsername: spec.owner ?? 'sales_a',
        status: spec.status,
        panels: (spec.panels ?? [{ tag: 'MSB-01', quantity: 1 }]).map(
          (panel) => ({ bomLines: [], ...panel }),
        ),
      });
      orderIds.push(orderId);
      return orderId;
    },
    async createItem() {
      const code = `PS${randomBytes(4).toString('hex')}`;
      const [row]: Array<{ id: number }> = await dataSource.query(
        `INSERT INTO items (code, name, item_group, unit)
         VALUES ($1, 'Production spec item', 'other', 'Cái') RETURNING id`,
        [code],
      );
      itemIds.push(row.id);
      return { id: row.id, code };
    },
    get: (path, as) => request(app.getHttpServer()).get(path).set(http(as)),
    post: (path, body, as) =>
      request(app.getHttpServer()).post(path).set(http(as)).send(body),
    patch: (path, body, as) =>
      request(app.getHttpServer()).patch(path).set(http(as)).send(body),
    createProduction: (orderId, as) =>
      harness.post('/production/orders', { orderId }, as),
    assign: (productionOrderId, unitId, body, as) =>
      harness.patch(
        `/production/orders/${productionOrderId}/units/${unitId}`,
        body,
        as,
      ),
    async prepare(productionOrderId, technician = 'techA') {
      for (const unit of await harness.units(productionOrderId)) {
        await harness
          .assign(productionOrderId, unit.id, {
            assigneeId: actors[technician].userId,
            plannedEndDate: ASSIGNED_DATE,
          })
          .expect(200);
      }
    },
    units: (productionOrderId) =>
      dataSource.query(
        `SELECT id, code, assignee_id FROM production_units
          WHERE production_order_id = $1 ORDER BY id`,
        [productionOrderId],
      ),
    async statusOfOrder(orderId) {
      const [row]: Array<{ status: string }> = await dataSource.query(
        `SELECT status FROM sales_orders WHERE id = $1`,
        [orderId],
      );
      return row.status;
    },
    async statusOfProduction(productionOrderId) {
      const [row]: Array<{ status: string }> = await dataSource.query(
        `SELECT status FROM production_orders WHERE id = $1`,
        [productionOrderId],
      );
      return row.status;
    },
    async notices(as, orderId) {
      const actor = actors[as];
      const page = await notifications.listForActor(
        { userId: actor.userId, permissions: actor.permissions },
        100,
      );
      return page.data.filter(
        (notice) => Number(notice.payload.orderId) === orderId,
      );
    },
    async close() {
      await app.close();
      if (orderIds.length > 0) {
        await dataSource.query(
          `DELETE FROM notifications
            WHERE (event_type LIKE 'production.%' OR event_type = 'sales.order.updated')
             AND (payload->>'orderId')::int = ANY($1)`,
          [orderIds],
        );
        const owned = `SELECT id FROM production_orders WHERE order_id = ANY($1)`;
        await dataSource.query(
          `DELETE FROM production_order_events WHERE production_order_id IN (${owned})`,
          [orderIds],
        );
        // The stage rows go with their unit.
        await dataSource.query(
          `DELETE FROM production_units WHERE production_order_id IN (${owned})`,
          [orderIds],
        );
        await dataSource.query(
          `DELETE FROM production_orders WHERE order_id = ANY($1)`,
          [orderIds],
        );
      }
      await fixture.cleanup();
      if (itemIds.length > 0) {
        await dataSource.query(`DELETE FROM items WHERE id = ANY($1)`, [
          itemIds,
        ]);
      }
      await dataSource.destroy();
    },
  };
  return harness;
}
