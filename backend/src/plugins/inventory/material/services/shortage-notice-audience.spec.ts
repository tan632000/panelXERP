import { DataSource } from 'typeorm';

import { NotificationRead } from '@kernel/core/audit/notification-read.entity';
import { Notification } from '@kernel/core/audit/notification.entity';
import { NotificationService } from '@kernel/core/audit/notification.service';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';
import { Role } from '@kernel/core/users/entities/role.entity';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';

import {
  describeWithDatabase,
  openInventoryDb,
  type InventoryDb,
} from '@plugins/inventory/_shared/inventory-db.helper-spec';
import { ADD_PRODUCTION_MANAGER_SQL } from '@plugins/inventory/material/database/migrations/1793401827364-add-production-manager-to-shortage-notices';
import {
  reservationKit,
  type ReservationKit,
} from '@plugins/inventory/material/reservation-db.helper-spec';

interface Reader {
  userId: number;
  permissions: string[];
}

/**
 * Who reads the shortage notice, through the notification list. The data step of the migration
 * is plain DML, so it is applied here as it runs; the schema itself is never touched.
 */
describeWithDatabase('Shortage notice audience (real Postgres)', () => {
  let db: InventoryDb;
  let kit: ReservationKit;
  let reader: DataSource;
  let notifications: NotificationService;
  let manager: Reader;
  let buyer: Reader;
  const orderIds: number[] = [];

  beforeAll(async () => {
    db = await openInventoryDb();
    kit = reservationKit(db);
    // The list resolves the actor's roles, which the inventory spec connection does not map.
    reader = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [Notification, NotificationRead, User, Role, UserRole],
    });
    await reader.initialize();
    notifications = new NotificationService(
      reader.getRepository(Notification),
      reader.getRepository(NotificationRead),
      reader.getRepository(UserRole),
    );
    manager = {
      userId: await db.userId('production_manager'),
      permissions: seededRolePermissions('productionManager') ?? [],
    };
    buyer = {
      userId: await db.userId('purchasing'),
      permissions: seededRolePermissions('purchasing') ?? [],
    };
  });

  afterAll(async () => {
    if (orderIds.length > 0) {
      await db.dataSource.query(
        `DELETE FROM notifications WHERE event_type LIKE 'inventory.order.short%'
           AND (payload->>'orderId')::int = ANY($1)`,
        [orderIds],
      );
    }
    await reader?.destroy();
    await kit?.cleanup();
    await db?.close();
  });

  const readableBy = async (actor: Reader, orderId: number) =>
    (await notifications.listForActor(actor, 100)).data.some(
      (notice) =>
        notice.eventType === 'inventory.order.short' &&
        Number(notice.payload.orderId) === orderId,
    );

  /** An order id no real order has, so the fixture notice cannot meet another suite's. */
  const fakeOrderId = () => {
    const id = 2_000_000_000 + Math.floor(Math.random() * 100_000_000);
    orderIds.push(id);
    return id;
  };

  const oldNotice = (orderId: number) =>
    notifications.emit({
      eventType: 'inventory.order.short',
      roleCodes: ['purchasing'],
      requiredScope: 'material:read',
      message: 'old',
      dedupeKey: `order:${orderId}`,
      payload: { orderId, code: 'OLD', shortItemCount: 1 },
    });

  const roleCodesOf = async (orderId: number) => {
    const [row]: Array<{ role_codes: string[] }> = await db.dataSource.query(
      `SELECT role_codes FROM notifications
        WHERE event_type = 'inventory.order.short' AND (payload->>'orderId')::int = $1`,
      [orderId],
    );
    return row.role_codes;
  };

  it('lets the production manager read a notice raised before the role was added, once the migration ran', async () => {
    const orderId = fakeOrderId();
    await oldNotice(orderId);
    expect(await readableBy(buyer, orderId)).toBe(true);
    expect(await readableBy(manager, orderId)).toBe(false);

    await db.dataSource.query(ADD_PRODUCTION_MANAGER_SQL);
    expect(await readableBy(manager, orderId)).toBe(true);
    expect(await readableBy(buyer, orderId)).toBe(true);

    // Running the step again appends nothing.
    await db.dataSource.query(ADD_PRODUCTION_MANAGER_SQL);
    expect(await roleCodesOf(orderId)).toEqual([
      'purchasing',
      'productionManager',
    ]);
  });

  it('leaves a closed notice as it was', async () => {
    const orderId = fakeOrderId();
    await oldNotice(orderId);
    await notifications.close({
      eventType: 'inventory.order.short',
      dedupeKey: `order:${orderId}`,
    });

    await db.dataSource.query(ADD_PRODUCTION_MANAGER_SQL);
    expect(await roleCodesOf(orderId)).toEqual(['purchasing']);
  });

  it('raises a new notice readable by both roles', async () => {
    const x = await db.createItem();
    const { orderId, change } = await kit.createOrder({
      bom: [{ itemId: x, perPanel: '3' }],
    });
    orderIds.push(orderId);
    await kit.alerts.afterCommit([orderId, ...change.orderIds], change.itemIds);

    expect(await readableBy(manager, orderId)).toBe(true);
    expect(await readableBy(buyer, orderId)).toBe(true);
  });
});
