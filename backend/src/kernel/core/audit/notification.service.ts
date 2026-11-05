import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  In,
  LessThan,
  Raw,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { NotificationRead } from '@kernel/core/audit/notification-read.entity';
import {
  Notification,
  NotificationStatus,
} from '@kernel/core/audit/notification.entity';
import { matchesPermission } from '@kernel/core/auth/utils/permission-match.util';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';

export interface EmitNotificationInput {
  eventType: string;
  roleCodes: string[];
  /**
   * Named recipients. When given, they — and not the role set — are the audience, so a
   * record meant for one order's creator never reaches their role-mates.
   */
  userIds?: number[];
  /**
   * Users the record withholds itself from even when their role is addressed — normally the
   * actor whose own action raised it.
   */
  excludeUserIds?: number[];
  /** Optional denormalised text; clients normally render from eventType and payload. */
  message?: string | null;
  link?: string | null;
  payload?: Record<string, unknown>;
  requiredScope?: string | null;
  /** Identity of the subject, so the matching record can be closed later. */
  dedupeKey?: string | null;
  createdBy?: number | null;
}

export interface CloseNotificationInput {
  eventType: string;
  dedupeKey: string;
  updatedBy?: number | null;
}

export interface NotificationView {
  id: number;
  eventType: string;
  message: string | null;
  link: string | null;
  payload: Record<string, unknown>;
  status: string;
  createdAt: Date;
  isRead: boolean;
}

/**
 * One page of notifications plus the anchor the client sends back to continue.
 *
 * `nextCursor` is the id of the last row handed out; null means the actor has reached the
 * end. Keyset rather than offset, so a record emitted while the user scrolls cannot shift
 * the window and make a row repeat or disappear.
 */
export interface NotificationPage {
  data: NotificationView[];
  nextCursor: number | null;
}

/** Rows one list request hands out when the caller names no size. */
export const DEFAULT_NOTIFICATION_PAGE_SIZE = 20;

/**
 * Rows one candidate query pulls before scope filtering. Scope matching runs in code, so a
 * batch can shrink to nothing and the page loop simply fetches the next batch.
 */
const CANDIDATE_BATCH_SIZE = 50;

/**
 * Business events the director reads although they name their recipients. Each is a
 * third-person fact about someone else's work with no role broadcast of its own; a notice
 * addressed to one colleague in the second person (a rejected signature, an assignment)
 * stays out, so the bell never turns into a copy of everyone's inbox.
 */
export const DIRECTOR_VISIBLE_PERSONAL_EVENTS: readonly string[] = [
  'sales.estimate.submitted',
  'sales.quotation.rejected',
  'inventory.purchase_order.rejected',
  'production.issue.resolved',
];

const DIRECTOR_ROLE = 'director';

/** Actor identity a caller must supply to read or mark notifications. */
export interface NotificationActor {
  userId: number;
  permissions?: string[];
}

/**
 * Kernel notification capability: role- or user-addressed records with per-recipient read
 * state.
 *
 * Two independent conditions gate a read — the record must be addressed to the caller
 * (named in `userIds`, or, when it names nobody, matching one of their roles and not naming
 * them in `excludeUserIds`; the director also reads every role broadcast and the allowlisted
 * events, see {@link DIRECTOR_VISIBLE_PERSONAL_EVENTS}), and the caller must hold the record's required scope. Read state is
 * always per user and never touches the shared `status`, which changes only when the
 * subject work completes.
 */
@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationRead)
    private readonly readRepo: Repository<NotificationRead>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
  ) {}

  /**
   * Creates one record addressed to the given role set and returns its id.
   * Runs on the caller's manager when supplied, so a rolled-back caller transaction
   * leaves no notification behind.
   */
  async emit(
    input: EmitNotificationInput,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = this.repo(manager);
    const saved = await repo.save(
      repo.create({
        eventType: input.eventType,
        dedupeKey: input.dedupeKey ?? null,
        roleCodes: [...input.roleCodes],
        userIds: [...(input.userIds ?? [])],
        excludeUserIds: [...(input.excludeUserIds ?? [])],
        requiredScope: input.requiredScope ?? null,
        message: input.message ?? null,
        link: input.link ?? null,
        payload: input.payload ?? {},
        status: NotificationStatus.OPEN,
        createdBy: input.createdBy ?? null,
        isDeleted: false,
      }),
    );
    return saved.id;
  }

  /**
   * Closes the open record for this event type and subject. Closure is a status change,
   * so it stops counting as outstanding for every recipient, including those who never
   * opened it.
   */
  async close(
    input: CloseNotificationInput,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.repo(manager).update(
      {
        eventType: input.eventType,
        dedupeKey: input.dedupeKey,
        status: NotificationStatus.OPEN,
        isDeleted: false,
      },
      {
        status: NotificationStatus.RESOLVED,
        updatedBy: input.updatedBy ?? null,
      },
    );
    return result.affected ?? 0;
  }

  /**
   * Frees the dedupe slot of an open record without touching what the recipient sees.
   *
   * For a recurring condition whose notice must survive the condition ending: the record stays
   * open and outstanding until its reader marks it read, while the subject becomes eligible to
   * raise a fresh one should it recur. The partial unique index skips a null dedupe key, which
   * is what makes the slot free. Distinct from {@link close}, which retires the record itself.
   */
  async releaseDedupeKey(
    input: CloseNotificationInput,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.repo(manager).update(
      {
        eventType: input.eventType,
        dedupeKey: input.dedupeKey,
        status: NotificationStatus.OPEN,
        isDeleted: false,
      },
      {
        dedupeKey: null,
        updatedBy: input.updatedBy ?? null,
      },
    );
    return result.affected ?? 0;
  }

  /**
   * The open record for one event type and subject, or null.
   *
   * A caller that must not raise a second record for the same subject checks here first;
   * the partial unique index is what settles a race between two callers that both saw none.
   */
  async findOpenByDedupeKey(
    eventType: string,
    dedupeKey: string,
    manager?: EntityManager,
  ): Promise<Notification | null> {
    return this.repo(manager).findOne({
      where: {
        eventType,
        dedupeKey,
        status: NotificationStatus.OPEN,
        isDeleted: false,
      },
    });
  }

  /** Which of `dedupeKeys` still have an open record of `eventType` — one read for many subjects. */
  async findOpenDedupeKeys(
    eventType: string,
    dedupeKeys: readonly string[],
  ): Promise<Set<string>> {
    if (dedupeKeys.length === 0) return new Set();
    const rows = await this.notificationRepo.find({
      where: {
        eventType,
        dedupeKey: In([...new Set(dedupeKeys)]),
        status: NotificationStatus.OPEN,
        isDeleted: false,
      },
      select: { id: true, dedupeKey: true },
    });
    return new Set(
      rows
        .map((row) => row.dedupeKey)
        .filter((key): key is string => Boolean(key)),
    );
  }

  /**
   * One page of notifications addressed to the actor, newest first, each with the actor's
   * read flag. `cursor` is the `nextCursor` of the previous page; omit it for the first.
   */
  async listForActor(
    actor: NotificationActor,
    limit = DEFAULT_NOTIFICATION_PAGE_SIZE,
    cursor?: number | null,
  ): Promise<NotificationPage> {
    const page = await this.readablePageForActor(actor, limit, cursor ?? null);
    if (!page.rows.length) return { data: [], nextCursor: null };

    const readIds = await this.readIdsForActor(
      actor.userId,
      page.rows.map((item) => item.id),
    );

    return {
      data: page.rows.map((item) => ({
        id: item.id,
        eventType: item.eventType,
        message: item.message ?? null,
        link: item.link ?? null,
        payload: item.payload ?? {},
        status: item.status,
        createdAt: item.createdAt,
        isRead: readIds.has(item.id),
      })),
      nextCursor: page.nextCursor,
    };
  }

  /** Records addressed to the actor that are neither read by the actor nor closed. */
  async unreadCountForActor(actor: NotificationActor): Promise<number> {
    const unread = await this.unreadQueryForActor(actor);
    return unread.getCount();
  }

  /** Marks one record read for this actor only. */
  async markRead(
    actor: NotificationActor,
    notificationId: number,
  ): Promise<{ id: number; isRead: true }> {
    // A record that closed since the list was loaded can still be opened and marked read.
    const readable = await this.readableRefsForActor(actor, {
      includeClosed: true,
      id: notificationId,
    });
    if (!readable.some((item) => item.id === notificationId)) {
      throw new ForbiddenException(
        'Notification is not addressed to this user.',
      );
    }

    await this.recordRead(actor.userId, [notificationId]);
    return { id: notificationId, isRead: true };
  }

  /** Marks every record currently addressed to this actor read, for this actor only. */
  async markAllRead(actor: NotificationActor): Promise<{ marked: number }> {
    const unread = await this.unreadQueryForActor(actor);

    // One statement however many records are unread: the ids never travel through the
    // application, so the bind-parameter count does not grow with the table. The unique
    // pair makes a concurrent mark-all or a single mark-read a no-op rather than an error.
    const [selectUnread, selectParams] = unread.getQueryAndParameters();
    const params: unknown[] = selectParams;
    const inserted: unknown[] = await this.readRepo.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       SELECT unread.n_id, $${params.length + 1} FROM (${selectUnread}) AS unread
       ON CONFLICT (notification_id, user_id) DO NOTHING
       RETURNING id`,
      [...params, actor.userId],
    );
    return { marked: inserted.length };
  }

  /** Role codes the user currently holds, resolved from assignments rather than the token,
   * which carries only the first role. */
  async resolveRoleCodes(userId: number): Promise<string[]> {
    const assignments = await this.userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });
    return assignments
      .map((assignment) => assignment.role?.code)
      .filter((code): code is string => Boolean(code));
  }

  /**
   * The records addressed to the actor that are open, in scope and not yet read by them, as
   * one query the database counts or marks without handing the ids back.
   *
   * The scope rule is the SQL twin of {@link matchesPermission}: exact, module wildcard,
   * action wildcard or full wildcard.
   */
  private async unreadQueryForActor(
    actor: NotificationActor,
  ): Promise<SelectQueryBuilder<Notification>> {
    const branches = await this.addressedToActor(actor.userId);

    const permissions = actor.permissions ?? [];
    return this.notificationRepo.createQueryBuilder('n').setFindOptions({
      select: { id: true },
      where: branches.map((branch) => ({
        ...branch,
        id: Raw(
          (alias: string) =>
            `NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = ${alias} AND r.user_id = :readerId)`,
          { readerId: actor.userId },
        ),
        requiredScope: Raw(
          (alias: string) =>
            `(NULLIF(${alias}, '') IS NULL OR '*:*' = ANY(:permissions::text[]) OR ${alias} = ANY(:permissions::text[]) OR (split_part(${alias}, ':', 1) || ':*') = ANY(:permissions::text[]) OR (split_part(${alias}, ':', 2) <> '' AND ('*:' || split_part(${alias}, ':', 2)) = ANY(:permissions::text[])))`,
          { permissions },
        ),
      })),
    });
  }

  /**
   * Ids of the records the actor may read: addressed to one of their roles and covered by a
   * scope they hold. Closed records are left out unless asked for; `id` narrows the read to
   * the one record a caller is about to touch.
   *
   * Only the id and the scope are selected, so a single mark-read never loads message and
   * payload. The bell's count and mark-all do not use this; they run as one SQL statement.
   */
  private async readableRefsForActor(
    actor: NotificationActor,
    options: { includeClosed?: boolean; id?: number } = {},
  ): Promise<Array<Pick<Notification, 'id' | 'requiredScope'>>> {
    const branches = await this.addressedToActor(
      actor.userId,
      options.includeClosed ?? false,
    );
    if (!branches.length) return [];

    // The addressing filter runs in SQL against the GIN indexes on role_codes and user_ids,
    // so a growing table is never loaded into memory. Scope matching stays in code because
    // it needs the same wildcard rules as the global guard.
    const candidates = await this.notificationRepo.find({
      where:
        options.id === undefined
          ? branches
          : branches.map((branch) => ({ ...branch, id: options.id })),
      select: { id: true, requiredScope: true },
      order: { id: 'DESC' },
    });

    return candidates.filter((item) => this.inScope(actor, item));
  }

  /**
   * The `where` branches matching every record addressed to this user: those naming them
   * directly, and — for records that name no user at all — those addressed to one of their
   * roles and not naming them as excluded. A record with named recipients is deliberately
   * invisible to the rest of the role; a role broadcast is invisible to whoever raised it.
   * A closed record "leaves the bell" for everyone, read or not, so only open ones match
   * unless `includeClosed` is set. A director also matches two branches, under the same open
   * rule, over records not raised by them and not excluding them: any role broadcast, and the
   * allowlisted events that name recipients.
   */
  private async addressedToActor(
    userId: number,
    includeClosed = false,
  ): Promise<Array<Record<string, unknown>>> {
    const roleCodes = await this.resolveRoleCodes(userId);
    const self = JSON.stringify([userId]);
    // A named recipient is never excluded — the record was addressed to them on purpose.
    const open = includeClosed ? {} : { status: NotificationStatus.OPEN };
    const branches: Array<Record<string, unknown>> = [
      {
        isDeleted: false,
        ...open,
        userIds: Raw((alias: string) => `${alias} @> :recipientId::jsonb`, {
          recipientId: self,
        }),
      },
    ];

    if (roleCodes.length) {
      branches.push({
        isDeleted: false,
        ...open,
        userIds: Raw((alias: string) => `jsonb_array_length(${alias}) = 0`),
        roleCodes: Raw((alias: string) => `${alias} ?| :roleCodes`, {
          roleCodes,
        }),
        excludeUserIds: Raw(
          (alias: string) => `NOT (${alias} @> :excludedId::jsonb)`,
          { excludedId: self },
        ),
      });
    }

    if (roleCodes.includes(DIRECTOR_ROLE)) {
      branches.push(...this.directorBranches(userId, self, open));
    }

    return branches;
  }

  /**
   * What the director reads on top of their own addressing: every role broadcast whatever
   * its role set, and the allowlisted business events that name recipients — in both cases
   * not raised by the director and not excluding them. The creator test compares the integer
   * id; `self` is the jsonb text used against the recipient lists and would not bind there.
   */
  private directorBranches(
    userId: number,
    self: string,
    open: Record<string, unknown>,
  ): Array<Record<string, unknown>> {
    const notExcluded = Raw(
      (alias: string) => `NOT (${alias} @> :excludedId::jsonb)`,
      { excludedId: self },
    );
    const notRaisedBy = Raw(
      (alias: string) => `${alias} IS DISTINCT FROM :creatorId`,
      { creatorId: userId },
    );
    const base = {
      isDeleted: false,
      ...open,
      excludeUserIds: notExcluded,
      createdBy: notRaisedBy,
    };
    return [
      {
        ...base,
        userIds: Raw((alias: string) => `jsonb_array_length(${alias}) = 0`),
      },
      {
        ...base,
        eventType: In([...DIRECTOR_VISIBLE_PERSONAL_EVENTS]),
        userIds: Raw((alias: string) => `jsonb_array_length(${alias}) > 0`),
      },
    ];
  }

  /**
   * One keyset page of readable records, walking candidate batches until the page is full.
   *
   * Ids are assigned in insertion order, so ordering and paging on the id alone yields the
   * same newest-first sequence as the timestamp while staying expressible as a single
   * `id < cursor` predicate.
   */
  private async readablePageForActor(
    actor: NotificationActor,
    limit: number,
    cursor: number | null,
  ): Promise<{ rows: Notification[]; nextCursor: number | null }> {
    const branches = await this.addressedToActor(actor.userId);
    if (!branches.length) return { rows: [], nextCursor: null };

    const batchSize = Math.max(limit + 1, CANDIDATE_BATCH_SIZE);
    const collected: Notification[] = [];
    let anchor = cursor;

    // One row beyond the page tells the caller whether another page exists.
    while (collected.length <= limit) {
      const cursorBranches = branches.map((branch) => ({
        ...branch,
        ...(anchor !== null ? { id: LessThan(anchor) } : {}),
      }));
      const candidates = await this.notificationRepo.find({
        where: cursorBranches,
        order: { id: 'DESC' },
        take: batchSize,
      });
      if (!candidates.length) break;

      anchor = candidates[candidates.length - 1].id;
      collected.push(...candidates.filter((item) => this.inScope(actor, item)));
      if (candidates.length < batchSize) break;
    }

    const rows = collected.slice(0, limit);
    const nextCursor =
      collected.length > limit && rows.length ? rows[rows.length - 1].id : null;
    return { rows, nextCursor };
  }

  private inScope(
    actor: NotificationActor,
    item: Pick<Notification, 'requiredScope'>,
  ): boolean {
    return (
      !item.requiredScope ||
      matchesPermission(actor.permissions ?? [], item.requiredScope)
    );
  }

  private async readIdsForActor(
    userId: number,
    notificationIds: number[],
  ): Promise<Set<number>> {
    if (!notificationIds.length) return new Set();

    const rows = await this.readRepo.find({
      where: { userId, notificationId: In(notificationIds) },
    });
    return new Set(rows.map((row) => row.notificationId));
  }

  private async recordRead(
    userId: number,
    notificationIds: number[],
  ): Promise<void> {
    if (!notificationIds.length) return;

    const existing = await this.readIdsForActor(userId, notificationIds);
    const rows = notificationIds
      .filter((id) => !existing.has(id))
      .map((id) => this.readRepo.create({ notificationId: id, userId }));

    if (rows.length) await this.readRepo.save(rows);
  }

  private repo(manager?: EntityManager): Repository<Notification> {
    return manager
      ? manager.getRepository(Notification)
      : this.notificationRepo;
  }
}
