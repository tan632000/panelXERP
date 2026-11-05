import { randomBytes } from 'node:crypto';

import { DataSource } from 'typeorm';

import { NotificationRead } from '@kernel/core/audit/notification-read.entity';
import { Notification } from '@kernel/core/audit/notification.entity';
import {
  NotificationService,
  type NotificationActor,
} from '@kernel/core/audit/notification.service';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';
import { Role } from '@kernel/core/users/entities/role.entity';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';

import { describeWithDatabase } from '@plugins/inventory/_shared/inventory-db.helper-spec';

const SCALE_ROWS = 70_000;

/**
 * What the director reads in the bell, on the real database: every role broadcast and the
 * allowlisted business events raised by someone else, never a colleague's personal notice, and
 * a count and mark-all that do not grow one bind parameter per record.
 */
describeWithDatabase('Director notification bell (real Postgres)', () => {
  let dataSource: DataSource;
  let notifications: NotificationService;
  let director: NotificationActor;
  let salesA: NotificationActor;
  let technician: NotificationActor;
  let engineer: NotificationActor;
  let lastReadMarkerId = 0;
  const probe = `director-bell-${randomBytes(6).toString('hex')}`;

  const userId = async (username: string): Promise<number> => {
    const [row]: Array<{ id: number }> = await dataSource.query(
      `SELECT id FROM users WHERE username = $1`,
      [username],
    );
    if (!row) throw new Error(`Seeded user ${username} is missing`);
    return row.id;
  };

  const actorOf = async (username: string, role: string) => ({
    userId: await userId(username),
    permissions: seededRolePermissions(role) ?? [],
  });

  /** The probe records the actor's bell holds, by the event type each was emitted with. */
  const bellOf = async (actor: NotificationActor): Promise<string[]> =>
    (await notifications.listForActor(actor, 200)).data
      .filter((row) => row.payload.probe === probe)
      .map((row) => row.eventType);

  const emit = (
    eventType: string,
    audience: {
      roleCodes?: string[];
      userIds?: number[];
      excludeUserIds?: number[];
      createdBy?: number;
      requiredScope?: string | null;
    },
  ) =>
    notifications.emit({
      eventType,
      roleCodes: audience.roleCodes ?? [],
      userIds: audience.userIds,
      excludeUserIds: audience.excludeUserIds,
      createdBy: audience.createdBy,
      requiredScope: audience.requiredScope,
      payload: { probe },
    });

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [Notification, NotificationRead, User, Role, UserRole],
    });
    try {
      await dataSource.initialize();
    } catch (error: unknown) {
      throw new Error(
        `Postgres is unreachable (${error instanceof Error ? error.message : String(error)}). Run inside the compose backend container, or set SKIP_DB_SPECS=1 to skip these checks.`,
      );
    }
    notifications = new NotificationService(
      dataSource.getRepository(Notification),
      dataSource.getRepository(NotificationRead),
      dataSource.getRepository(UserRole),
    );
    director = await actorOf('director', 'director');
    salesA = await actorOf('sales_a', 'sales');
    technician = await actorOf('technician_a', 'technician');
    engineer = await actorOf('engineer_a', 'engineer');
    // Mark-all writes read markers for the director and the technician on real records; the
    // ones this suite adds are removed again so the demo bells are left as found.
    const [marker]: Array<{ last: number }> = await dataSource.query(
      `SELECT COALESCE(MAX(id), 0) AS last FROM notification_reads`,
    );
    lastReadMarkerId = marker.last;
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    const readers = [director, technician]
      .filter(Boolean)
      .map((actor) => actor.userId);
    if (readers.length > 0) {
      await dataSource.query(
        `DELETE FROM notification_reads WHERE user_id = ANY($1::int[]) AND id > $2`,
        [readers, lastReadMarkerId],
      );
    }
    await dataSource.query(
      `DELETE FROM notifications WHERE payload->>'probe' = $1`,
      [probe],
    );
    await dataSource.destroy();
  }, 60_000);

  it('lists the broadcast and the allowlisted event, counts and marks exactly those', async () => {
    const unreadBefore = await notifications.unreadCountForActor(director);
    await emit('probe.broadcast', { roleCodes: ['productionManager'] });
    await emit('production.issue.resolved', {
      userIds: [technician.userId],
      createdBy: salesA.userId,
    });
    await emit('signature_review_rejected', { userIds: [salesA.userId] });
    await emit('sales.request.assigned', { userIds: [engineer.userId] });
    await emit('probe.excluded', {
      roleCodes: ['productionManager'],
      excludeUserIds: [director.userId],
    });
    await emit('probe.own', {
      roleCodes: ['productionManager'],
      createdBy: director.userId,
    });

    expect((await bellOf(director)).sort()).toEqual([
      'probe.broadcast',
      'production.issue.resolved',
    ]);

    const probeUnread = async () =>
      (await notifications.listForActor(director, 200)).data.filter(
        (row) => row.payload.probe === probe && !row.isRead,
      ).length;
    expect(await probeUnread()).toBe(2);
    const unreadAfter = await notifications.unreadCountForActor(director);
    expect(unreadAfter - unreadBefore).toBe(2);

    const { marked } = await notifications.markAllRead(director);
    expect(marked).toBe(unreadAfter);
    expect(await probeUnread()).toBe(0);

    // The signature notice is still the sales user's alone, unread.
    const signature = (await notifications.listForActor(salesA, 200)).data.find(
      (row) =>
        row.payload.probe === probe &&
        row.eventType === 'signature_review_rejected',
    );
    expect(signature?.isRead).toBe(false);
  });

  it('applies the scope rule in the count and mark-all to exact, module, action, empty and missing scopes', async () => {
    const holder: NotificationActor = {
      userId: technician.userId,
      permissions: ['sales:read', 'product:*', '*:notify'],
    };
    const scopes: Array<[string, string | null]> = [
      ['probe.exact', 'sales:read'],
      ['probe.module', 'product:write:general'],
      ['probe.action', 'order:notify'],
      ['probe.empty', ''],
      ['probe.none', null],
      ['probe.lacking', 'material:read'],
      ['probe.other-action', 'order:write'],
    ];
    const unreadBefore = await notifications.unreadCountForActor(holder);
    for (const [eventType, requiredScope] of scopes) {
      await emit(eventType, { roleCodes: ['technician'], requiredScope });
    }

    // Another case may name this technician in a personal notice; only these broadcasts count here.
    const broadcasts = (await bellOf(holder)).filter((type) =>
      type.startsWith('probe.'),
    );
    expect(broadcasts.sort()).toEqual([
      'probe.action',
      'probe.empty',
      'probe.exact',
      'probe.module',
      'probe.none',
    ]);
    const unreadAfter = await notifications.unreadCountForActor(holder);
    expect(unreadAfter - unreadBefore).toBe(5);

    const { marked } = await notifications.markAllRead(holder);
    expect(marked).toBe(unreadAfter);
    expect(await notifications.unreadCountForActor(holder)).toBe(0);
  });

  it('counts and marks 70 000 open broadcasts in one statement each', async () => {
    await dataSource.query(
      `INSERT INTO notifications (event_type, role_codes, user_ids, exclude_user_ids, payload, status)
       SELECT 'probe.scale', '["productionManager"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
              jsonb_build_object('probe', $1::text), 'open'
         FROM generate_series(1, ${SCALE_ROWS})`,
      [probe],
    );

    // What autovacuum does after a bulk load: without fresh statistics a connection that
    // cached a foreign-key lookup plan against the near-empty table keeps scanning it.
    await dataSource.query(`ANALYZE notifications`);

    expect(
      await notifications.unreadCountForActor(director),
    ).toBeGreaterThanOrEqual(SCALE_ROWS);
    const { marked } = await notifications.markAllRead(director);
    expect(marked).toBeGreaterThanOrEqual(SCALE_ROWS);
    expect(await notifications.unreadCountForActor(director)).toBeLessThan(
      SCALE_ROWS,
    );
  }, 120_000);
});
