import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { NotificationRead } from '@kernel/core/audit/notification-read.entity';
import {
  Notification,
  NotificationStatus,
} from '@kernel/core/audit/notification.entity';
import { NotificationService } from '@kernel/core/audit/notification.service';
import { matchesPermission } from '@kernel/core/auth/utils/permission-match.util';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';

import type { FindManyOptions, FindOptionsWhere } from 'typeorm';

const TECHNICAL_ROLES = ['technical_manager', 'technical_staff'];
const NOTIFY_SCOPE = 'product:notify';

/** In-memory stand-ins so read state and status changes are observable across actors. */
describe('NotificationService', () => {
  let service: NotificationService;
  let notifications: Notification[];
  let reads: NotificationRead[];
  let rolesByUser: Record<number, string[]>;
  let nextNotificationId: number;
  let nextReadId: number;

  type Branch = FindOptionsWhere<Notification> & {
    roleCodes?: { objectLiteralParameters?: { roleCodes?: string[] } };
    userIds?: { objectLiteralParameters?: { recipientId?: string } };
    excludeUserIds?: { objectLiteralParameters?: { excludedId?: string } };
    createdBy?: { objectLiteralParameters?: { creatorId?: number } };
    requiredScope?: { objectLiteralParameters?: { permissions?: string[] } };
    id?: {
      value?: unknown;
      objectLiteralParameters?: { readerId?: number };
    };
    eventType?: { value?: string[] };
  };

  const matchesBranch = (row: Notification, where: Branch): boolean => {
    // Honour the SQL-side role filter so the stand-in cannot pass rows that the
    // real jsonb `?|` predicate would exclude.
    const requestedRoles =
      where.roleCodes?.objectLiteralParameters?.roleCodes ?? null;
    // Honour the keyset anchor and the batch size too, so a paging bug cannot hide
    // behind a stand-in that always returns the whole table.
    const beforeId =
      typeof where.id?.value === 'number' ? where.id.value : null;
    const recipientId = where.userIds?.objectLiteralParameters?.recipientId;
    const namedRecipient =
      recipientId === undefined
        ? null
        : (JSON.parse(recipientId) as number[])[0];

    if (where.isDeleted !== undefined && row.isDeleted !== where.isDeleted) {
      return false;
    }
    if (where.status !== undefined && row.status !== where.status) {
      return false;
    }
    if (beforeId !== null && row.id >= beforeId) return false;

    // The unread and scope conditions the count and mark-all statements add.
    const readerId = where.id?.objectLiteralParameters?.readerId;
    if (
      readerId !== undefined &&
      reads.some(
        (read) => read.userId === readerId && read.notificationId === row.id,
      )
    ) {
      return false;
    }
    const permissions =
      where.requiredScope?.objectLiteralParameters?.permissions;
    if (
      permissions !== undefined &&
      row.requiredScope &&
      !matchesPermission(permissions, row.requiredScope)
    ) {
      return false;
    }

    // The user branch names a reader; the role branch applies only to records that name
    // none, so a user-addressed record never reaches the rest of its creator's role.
    if (namedRecipient !== null) {
      return (row.userIds ?? []).includes(namedRecipient);
    }

    // A role broadcast withholds itself from the users it names as excluded.
    const excludedId =
      where.excludeUserIds?.objectLiteralParameters?.excludedId;
    if (
      excludedId !== undefined &&
      (row.excludeUserIds ?? []).includes(
        (JSON.parse(excludedId) as number[])[0],
      )
    ) {
      return false;
    }

    // The director branches: any role broadcast, or an allowlisted event with named
    // recipients, in both cases not raised by the reader.
    const creatorId = where.createdBy?.objectLiteralParameters?.creatorId;
    if (creatorId !== undefined) {
      if (row.createdBy === creatorId) return false;
      const allowedEvents = where.eventType?.value;
      return allowedEvents
        ? (row.userIds ?? []).length > 0 &&
            allowedEvents.includes(row.eventType)
        : (row.userIds ?? []).length === 0;
    }
    if ((row.userIds ?? []).length > 0) return false;

    return (
      requestedRoles === null ||
      (row.roleCodes ?? []).some((code) => requestedRoles.includes(code))
    );
  };

  const findRows = (
    options?: FindManyOptions<Notification>,
  ): Notification[] => {
    // The service addresses a reader through OR'd branches — records naming them, and
    // role-addressed records naming nobody — so the stand-in matches a row when any branch
    // accepts it, exactly as the real disjunction does.
    const branches = (
      Array.isArray(options?.where) ? options.where : [options?.where ?? {}]
    ) as Branch[];
    const rows = notifications.filter((row) =>
      branches.some((branch) => matchesBranch(row, branch)),
    );
    const ordered = [...rows].sort((a, b) => b.id - a.id);
    return options?.take ? ordered.slice(0, options.take) : ordered;
  };

  const notificationRepo = {
    create: (value: Partial<Notification>) => ({ ...value }) as Notification,
    save: (value: Notification) => {
      const row = {
        ...value,
        id: nextNotificationId++,
        createdAt: new Date(2026, 7, 17, 9, nextNotificationId),
      };
      notifications.push(row);
      return Promise.resolve(row);
    },
    find: (options?: FindManyOptions<Notification>) =>
      Promise.resolve(findRows(options)),
    // The service counts and marks through one statement built from the same `where`
    // branches; the stand-in answers it from the rows those branches accept.
    createQueryBuilder: () => {
      let where: FindManyOptions<Notification>['where'];
      const accepted = () => findRows({ where });
      const builder = {
        setFindOptions: (options: FindManyOptions<Notification>) => {
          where = options.where;
          return builder;
        },
        getCount: () => Promise.resolve(accepted().length),
        getQueryAndParameters: () =>
          ['SELECT', accepted().map((row) => row.id)] as const,
      };
      return builder;
    },
    update: (criteria: Partial<Notification>, patch: Partial<Notification>) => {
      const matched = notifications.filter((row) =>
        Object.entries(criteria).every(
          ([key, value]) => row[key as keyof Notification] === value,
        ),
      );
      for (const row of matched) Object.assign(row, patch);
      return Promise.resolve({ affected: matched.length });
    },
  };

  const readRepo = {
    create: (value: Partial<NotificationRead>) =>
      ({ ...value }) as NotificationRead,
    save: (rows: NotificationRead[]) => {
      for (const row of rows) reads.push({ ...row, id: nextReadId++ });
      return Promise.resolve(rows);
    },
    // The mark-all statement: the stand-in receives the selected ids and the reader last,
    // and returns one row per marker it inserted, as `RETURNING` does.
    query: (_sql: string, params: number[]) => {
      const readerId = params[params.length - 1];
      const inserted: Array<{ id: number }> = [];
      for (const notificationId of params.slice(0, -1)) {
        const known = reads.some(
          (row) =>
            row.userId === readerId && row.notificationId === notificationId,
        );
        if (known) continue;
        const id = nextReadId++;
        reads.push({
          id,
          userId: readerId,
          notificationId,
        } as NotificationRead);
        inserted.push({ id });
      }
      return Promise.resolve(inserted);
    },
    find: (options?: FindManyOptions<NotificationRead>) => {
      const where = (options?.where ?? {}) as {
        userId?: number;
        notificationId?: { _value?: number[] } | number;
      };
      const ids =
        typeof where.notificationId === 'object'
          ? (where.notificationId?._value ?? [])
          : [];
      return Promise.resolve(
        reads.filter(
          (row) =>
            row.userId === where.userId && ids.includes(row.notificationId),
        ),
      );
    },
  };

  const userRoleRepo = {
    find: (options?: FindManyOptions<UserRole>) => {
      const where = (options?.where ?? {}) as { userId?: number };
      const codes = rolesByUser[where.userId ?? 0] ?? [];
      return Promise.resolve(
        codes.map((code, index) => ({
          id: index + 1,
          userId: where.userId,
          roleId: index + 1,
          role: { code },
        })) as unknown as UserRole[],
      );
    },
  };

  const technicalManager = { userId: 1, permissions: [NOTIFY_SCOPE] };
  const technicalStaff = { userId: 2, permissions: [NOTIFY_SCOPE] };
  const salesStaff = { userId: 3, permissions: ['product:write:general'] };
  const director = { userId: 4, permissions: ['*:*'] };

  async function emitTechnicalNotification(dedupeKey: string) {
    return service.emit({
      eventType: 'sp_can_bo_sung_ky_thuat',
      roleCodes: TECHNICAL_ROLES,
      requiredScope: NOTIFY_SCOPE,
      dedupeKey,
      link: `/sales/product/${dedupeKey}`,
      payload: { sfgCode: `FG_${dedupeKey}`, productName: 'Vít lục giác' },
      createdBy: 9,
    });
  }

  beforeEach(async () => {
    notifications = [];
    reads = [];
    nextNotificationId = 1;
    nextReadId = 1;
    rolesByUser = {
      1: ['technical_manager'],
      2: ['technical_staff'],
      3: ['sale_staff'],
      4: ['director'],
      5: ['sale_staff', 'technical_staff'],
      6: [],
      7: ['warehouse_staff'],
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(Notification),
          useValue: notificationRepo,
        },
        { provide: getRepositoryToken(NotificationRead), useValue: readRepo },
        { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
      ],
    }).compile();
    service = module.get(NotificationService);
  });

  it('persists every documented field on emit (R5.1)', async () => {
    const id = await emitTechnicalNotification('7');
    const stored = notifications.find((row) => row.id === id);

    expect(stored).toBeDefined();
    expect(stored?.eventType).toBe('sp_can_bo_sung_ky_thuat');
    expect(stored?.link).toBe('/sales/product/7');
    expect(stored?.status).toBe(NotificationStatus.OPEN);
    expect(stored?.payload).toEqual({
      sfgCode: 'FG_7',
      productName: 'Vít lục giác',
    });
    expect(stored?.createdBy).toBe(9);
    expect(stored?.dedupeKey).toBe('7');
  });

  it('counts and marks read without loading the readable records', async () => {
    await emitTechnicalNotification('7');
    await emitTechnicalNotification('8');
    const find = jest.spyOn(notificationRepo, 'find');

    expect(await service.unreadCountForActor(technicalManager)).toBe(2);
    expect((await service.markAllRead(technicalStaff)).marked).toBe(2);
    expect(find).not.toHaveBeenCalled();

    await service.markRead(technicalManager, 2);
    expect(find.mock.calls.at(-1)?.[0]).toMatchObject({
      select: { id: true, requiredScope: true },
    });
    const markReadWhere = find.mock.calls.at(-1)?.[0]?.where as Array<{
      id?: number;
    }>;
    expect(markReadWhere.every((branch) => branch.id === 2)).toBe(true);
    expect(await service.unreadCountForActor(technicalManager)).toBe(1);

    find.mockRestore();
  });

  it('answers the open subjects of many dedupe keys with one read', async () => {
    const find = jest
      .spyOn(notificationRepo, 'find')
      .mockResolvedValueOnce([
        { id: 1, dedupeKey: 'plan:7:line:11' },
      ] as Notification[]);

    const open = await service.findOpenDedupeKeys('delivery_plan_shortage', [
      'plan:7:line:11',
      'plan:7:line:12',
      'plan:7:line:11',
    ]);

    expect(open).toEqual(new Set(['plan:7:line:11']));
    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0]?.[0]).toMatchObject({
      where: {
        eventType: 'delivery_plan_shortage',
        status: NotificationStatus.OPEN,
        isDeleted: false,
      },
    });
    find.mockRestore();
    await expect(service.findOpenDedupeKeys('x', [])).resolves.toEqual(
      new Set(),
    );
  });

  it('keeps read state independent per recipient (R5.2)', async () => {
    await emitTechnicalNotification('7');

    await service.markRead(technicalManager, 1);

    expect(await service.unreadCountForActor(technicalManager)).toBe(0);
    expect(await service.unreadCountForActor(technicalStaff)).toBe(1);

    const managerPage = await service.listForActor(technicalManager);
    const staffPage = await service.listForActor(technicalStaff);
    expect(managerPage.data[0].isRead).toBe(true);
    expect(staffPage.data[0].isRead).toBe(false);
  });

  it('addresses role codes rather than user ids (R5.3)', async () => {
    await emitTechnicalNotification('7');
    const stored = notifications[0];

    expect(stored.roleCodes).toEqual(TECHNICAL_ROLES);
    expect(Object.keys(stored)).not.toContain('userId');

    // A user who holds a technical role among several still sees the record.
    const multiRole = { userId: 5, permissions: [NOTIFY_SCOPE] };
    expect(await service.unreadCountForActor(multiRole)).toBe(1);
  });

  it('withholds a record whose role set or scope the actor lacks (R5.4)', async () => {
    await emitTechnicalNotification('7');

    // Wrong role, holds no notify scope either.
    expect((await service.listForActor(salesStaff)).data).toHaveLength(0);

    // Right role but the scope was revoked.
    const scopelessTechnical = { userId: 2, permissions: [] };
    expect((await service.listForActor(scopelessTechnical)).data).toHaveLength(
      0,
    );

    // A wildcard scope without the director role needs an addressed role: no role assignment
    // at all sees nothing.
    expect(
      (await service.listForActor({ userId: 6, permissions: ['*:*'] })).data,
    ).toHaveLength(0);

    expect((await service.listForActor(technicalStaff)).data).toHaveLength(1);
  });

  it('shows the director every role broadcast raised by someone else', async () => {
    await emitTechnicalNotification('7');

    const page = await service.listForActor(director);

    expect(page.data.map((row) => row.payload.sfgCode)).toEqual(['FG_7']);
    expect(await service.unreadCountForActor(director)).toBe(1);
  });

  it('withholds from the director a broadcast it raised or is excluded from', async () => {
    await service.emit({
      eventType: 'sp_can_bo_sung_ky_thuat',
      roleCodes: TECHNICAL_ROLES,
      createdBy: director.userId,
    });
    await service.emit({
      eventType: 'sp_can_bo_sung_ky_thuat',
      roleCodes: TECHNICAL_ROLES,
      excludeUserIds: [director.userId],
      createdBy: 9,
    });

    expect((await service.listForActor(director)).data).toHaveLength(0);
    expect(await service.unreadCountForActor(director)).toBe(0);
  });

  it('shows the director an allowlisted personal event and no other', async () => {
    await service.emit({
      eventType: 'production.issue.resolved',
      roleCodes: [],
      userIds: [technicalStaff.userId],
      createdBy: 9,
    });
    await service.emit({
      eventType: 'signature_review_rejected',
      roleCodes: [],
      userIds: [salesStaff.userId],
      createdBy: 9,
    });

    const page = await service.listForActor(director);

    expect(page.data.map((row) => row.eventType)).toEqual([
      'production.issue.resolved',
    ]);
    expect((await service.listForActor(salesStaff)).data).toHaveLength(1);
  });

  /**
   * A record naming its recipients is theirs alone: the rest of their role must not read a
   * message addressed to one person, and being named beats holding no addressed role at all.
   */
  it('hands a user-addressed record to the named user only', async () => {
    await service.emit({
      eventType: 'po_da_duyet',
      roleCodes: [],
      userIds: [technicalStaff.userId],
      requiredScope: NOTIFY_SCOPE,
      link: '/procurement/purchase-order/purchase/1',
      payload: { poNo: 'HP-TM-2026-0001' },
      createdBy: 9,
    });

    expect((await service.listForActor(technicalStaff)).data).toHaveLength(1);
    // Same role, not named: the record stays out of their bell.
    expect((await service.listForActor(technicalManager)).data).toHaveLength(0);
    // The director does not read a personal notice that is not on the allowlist, and a
    // wildcard scope without the director role does not substitute for being addressed.
    expect((await service.listForActor(director)).data).toHaveLength(0);
    expect(
      (await service.listForActor({ userId: 6, permissions: ['*:*'] })).data,
    ).toHaveLength(0);
  });

  /** A broadcast withholds itself from whoever raised it — they already saw the result. */
  it('withholds a role-addressed record from an excluded user', async () => {
    await service.emit({
      eventType: 'po_moi_can_trien_khai',
      roleCodes: ['technical_manager', 'technical_staff'],
      excludeUserIds: [technicalManager.userId],
      requiredScope: NOTIFY_SCOPE,
      link: '/procurement/purchase-order/purchase/1',
      payload: { poNo: 'HP-TM-2026-0001' },
      createdBy: technicalManager.userId,
    });

    expect((await service.listForActor(technicalManager)).data).toHaveLength(0);
    expect((await service.listForActor(technicalStaff)).data).toHaveLength(1);
  });

  it('leaves the shared status untouched when one recipient reads (R5.5)', async () => {
    await emitTechnicalNotification('7');

    await service.markRead(technicalManager, 1);

    expect(notifications[0].status).toBe(NotificationStatus.OPEN);
  });

  it('refuses a mark-read for a record addressed to none of the actor roles (R5.6)', async () => {
    await emitTechnicalNotification('7');

    await expect(service.markRead(salesStaff, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(reads).toHaveLength(0);
  });

  it('marks all read for the caller only (R5.7)', async () => {
    await emitTechnicalNotification('7');
    await emitTechnicalNotification('8');

    const result = await service.markAllRead(technicalManager);

    expect(result.marked).toBe(2);
    expect(await service.unreadCountForActor(technicalManager)).toBe(0);
    expect(await service.unreadCountForActor(technicalStaff)).toBe(2);
    expect(reads.every((row) => row.userId === technicalManager.userId)).toBe(
      true,
    );
  });

  it('marks nothing twice when called again (R5.7)', async () => {
    await emitTechnicalNotification('7');
    await service.markAllRead(technicalManager);

    const second = await service.markAllRead(technicalManager);

    expect(second.marked).toBe(0);
    expect(reads).toHaveLength(1);
  });

  it('drops a closed record from every unread count including unopened ones (R5.8)', async () => {
    await emitTechnicalNotification('7');
    expect(await service.unreadCountForActor(technicalStaff)).toBe(1);

    const affected = await service.close({
      eventType: 'sp_can_bo_sung_ky_thuat',
      dedupeKey: '7',
      updatedBy: 11,
    });

    expect(affected).toBe(1);
    expect(notifications[0].status).toBe(NotificationStatus.RESOLVED);
    expect(await service.unreadCountForActor(technicalManager)).toBe(0);
    expect(await service.unreadCountForActor(technicalStaff)).toBe(0);
    expect(reads).toHaveLength(0);
  });

  it('keeps a closed record out of the list, while it can still be marked read', async () => {
    await emitTechnicalNotification('7');
    await emitTechnicalNotification('8');
    await service.close({
      eventType: 'sp_can_bo_sung_ky_thuat',
      dedupeKey: '7',
    });

    const page = await service.listForActor(technicalStaff);

    expect(page.data.map((row) => row.payload.sfgCode)).toEqual(['FG_8']);
    await expect(service.markRead(technicalStaff, 1)).resolves.toEqual({
      id: 1,
      isRead: true,
    });
  });

  it('closes only the matching open subject (R5.8)', async () => {
    await emitTechnicalNotification('7');
    await emitTechnicalNotification('8');

    await service.close({
      eventType: 'sp_can_bo_sung_ky_thuat',
      dedupeKey: '7',
    });

    expect(notifications.find((row) => row.dedupeKey === '7')?.status).toBe(
      NotificationStatus.RESOLVED,
    );
    expect(notifications.find((row) => row.dedupeKey === '8')?.status).toBe(
      NotificationStatus.OPEN,
    );
    expect(await service.unreadCountForActor(technicalStaff)).toBe(1);
  });

  it('counts only unread and open records for the caller (R5.9)', async () => {
    await emitTechnicalNotification('7');
    await emitTechnicalNotification('8');
    await emitTechnicalNotification('9');

    await service.markRead(technicalStaff, 1);
    await service.close({
      eventType: 'sp_can_bo_sung_ky_thuat',
      dedupeKey: '8',
    });

    expect(await service.unreadCountForActor(technicalStaff)).toBe(1);
    expect(await service.unreadCountForActor(technicalManager)).toBe(2);
  });

  it('lists newest first (R5.4)', async () => {
    await emitTechnicalNotification('7');
    await emitTechnicalNotification('8');

    const page = await service.listForActor(technicalStaff);

    expect(page.data.map((row) => row.payload.sfgCode)).toEqual([
      'FG_8',
      'FG_7',
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('hands out one page at a time and walks the cursor to the end (R5.4)', async () => {
    for (let index = 0; index < 5; index += 1) {
      await emitTechnicalNotification(String(index));
    }

    const first = await service.listForActor(technicalStaff, 2);
    expect(first.data.map((row) => row.id)).toEqual([5, 4]);
    expect(first.nextCursor).toBe(4);

    const second = await service.listForActor(
      technicalStaff,
      2,
      first.nextCursor,
    );
    expect(second.data.map((row) => row.id)).toEqual([3, 2]);
    expect(second.nextCursor).toBe(2);

    const third = await service.listForActor(
      technicalStaff,
      2,
      second.nextCursor,
    );
    expect(third.data.map((row) => row.id)).toEqual([1]);
    expect(third.nextCursor).toBeNull();
  });

  it('skips records the scope withholds without shortening the page (R5.4)', async () => {
    await emitTechnicalNotification('1');
    await service.emit({
      eventType: 'sp_can_bo_sung_ky_thuat',
      roleCodes: TECHNICAL_ROLES,
      requiredScope: 'product:notify:restricted',
      dedupeKey: '2',
      payload: {},
    });
    await emitTechnicalNotification('3');

    const page = await service.listForActor(technicalStaff, 2);

    expect(page.data.map((row) => row.id)).toEqual([3, 1]);
    expect(page.nextCursor).toBeNull();
  });
});
