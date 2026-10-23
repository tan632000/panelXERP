import { randomBytes } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import {
  In,
  Repository,
  type EntityManager,
  type FindOptionsSelect,
  type FindOptionsWhere,
  type SelectQueryBuilder,
} from 'typeorm';

import { AuthPrincipalCache } from '@kernel/core/auth/auth-principal-cache.service';
import { UserSession } from '@kernel/core/auth/entities/user-session.entity';
import { revokeUserSessions } from '@kernel/core/auth/utils/user-sessions.util';
import { AdminResetPasswordDto } from '@kernel/core/users/dto/admin-reset-password.dto';
import { CreateUserDto } from '@kernel/core/users/dto/create-user.dto';
import { SetUserActiveDto } from '@kernel/core/users/dto/set-user-active.dto';
import { UpdateUserDto } from '@kernel/core/users/dto/update-user.dto';
import {
  UserColumnValuesQueryDto,
  UserFilterDto,
} from '@kernel/core/users/dto/user-filter.dto';
import { Role } from '@kernel/core/users/entities/role.entity';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';
import { resolveStoredImageUrl } from '@kernel/core/users/utils/stored-image-url.util';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { S3StorageService } from '@shared/services/s3-storage.service';
import { bulkSoftDelete } from '@shared/utils/bulk-delete.util';
import {
  applyColumnFilterQuery,
  applyListWhere,
  findColumnValues,
  toListScopeQuery,
  type ColumnFilterMap,
} from '@shared/utils/column-filter.util';
import { applyColumnSort } from '@shared/utils/column-sort.util';
import { resolvePagination } from '@shared/utils/pagination.util';
import { softDeleteWithAudit } from '@shared/utils/soft-delete.util';
import { buildIlikeOrWhere } from '@shared/utils/typeorm-search.util';

/** Same work factor the auth service writes with, so hashes stay uniform. */
const BCRYPT_ROUNDS = 10;

/**
 * Fills the password column of an account created without one. Nothing can match it, so the
 * only way in is the reset link the holder receives — a NULL hash would instead make every
 * `bcrypt.compare` in the sign-in path throw.
 */
function unusableSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Alias the list queries address the table through. Not `user`: that is a reserved word in
 * Postgres, and the raw SQL the column filters write — the role's `EXISTS` subquery — leaves
 * the alias unquoted.
 */
const USER_ALIAS = 'account';

/**
 * Columns the list table filters and enumerates values for.
 *
 * The role lives in `user_roles`, so it is matched with `EXISTS` rather than a join: a join
 * would multiply a row per assignment and break both the count and the paging.
 */
export const USER_COLUMN_FILTERS: ColumnFilterMap = {
  username: { field: 'username' },
  fullName: { field: 'fullName' },
  email: { field: 'email' },
  phone: { field: 'phone' },
  department: { field: 'department' },
  title: { field: 'title' },
  isActive: { field: 'isActive' },
  // A timestamp filtered value by value would offer one entry per second; the filter lists
  // the day instead, which is what an administrator picks an account by.
  lastLoginAt: {
    expression: `to_char("account"."last_login_at", 'YYYY-MM-DD')`,
  },
  // Whether a picture is on file, not the picture itself: the key differs on every account.
  avatarUrl: {
    expression: `CASE WHEN "account"."avatar_url" IS NULL THEN 'false' ELSE 'true' END`,
  },
  // A signature waiting for review is its own value, so the administrator can list the queue.
  signatureUrl: {
    expression: `CASE WHEN "account"."pending_signature_url" IS NOT NULL THEN 'pending' WHEN "account"."signature_url" IS NULL THEN 'false' ELSE 'true' END`,
  },
  roleName: {
    matchWithExists: {
      table: 'user_roles',
      foreignKey: 'user_id',
      joins: [
        {
          table: 'roles',
          alias: 'role',
          on: 'role.id = related.role_id',
          // The util prefixes this with the join alias, so it carries the bare condition.
          where: 'is_deleted = false',
        },
      ],
      sources: [{ from: { alias: 'role', column: 'name' } }],
    },
  },
};

/**
 * Columns whose ORDER BY the find-options path cannot express — one is matched through
 * another table, the other is filtered as formatted text. Both are ordered by the SQL below
 * instead, so every column of the table sorts.
 */
const SORT_EXPRESSIONS: Record<string, string> = {
  /**
   * A correlated subquery rather than a join: an account carrying two assignment rows would
   * otherwise appear twice on the page and be counted twice in the total. This reads the
   * first one, which is the one the list itself shows.
   */
  roleName: `(SELECT "sort_role"."name" FROM "user_roles" "sort_assignment"
      JOIN "roles" "sort_role" ON "sort_role"."id" = "sort_assignment"."role_id"
      WHERE "sort_assignment"."user_id" = "account"."id"
      ORDER BY "sort_assignment"."id" LIMIT 1)`,
  lastLoginAt: '"account"."last_login_at"',
};

const SEARCHABLE_COLUMNS = [
  'username',
  'email',
  'fullName',
  'phone',
  'department',
  'title',
];

export type UserListItem = Pick<
  User,
  | 'id'
  | 'username'
  | 'email'
  | 'fullName'
  | 'phone'
  | 'avatarUrl'
  | 'signatureUrl'
  | 'pendingSignatureUrl'
  | 'signatureRequestedAt'
  | 'department'
  | 'title'
  | 'isActive'
  | 'lastLoginAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  /** The account's single role, flattened out of `user_roles` for the list table. */
  roleCode: string | null;
  roleName: string | null;
};

const LIST_SELECT = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  phone: true,
  avatarUrl: true,
  signatureUrl: true,
  pendingSignatureUrl: true,
  signatureRequestedAt: true,
  department: true,
  title: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** The columns of the Excel export: exactly what the table prints as text. */
const EXPORT_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  department: true,
  phone: true,
  title: true,
  isActive: true,
  lastLoginAt: true,
} as const;

export type UserExportRow = Pick<
  User,
  | 'username'
  | 'fullName'
  | 'email'
  | 'department'
  | 'phone'
  | 'title'
  | 'isActive'
  | 'lastLoginAt'
> & { roleName: string | null };

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(UserSession)
    private readonly sessionRepo: Repository<UserSession>,
    private readonly s3: S3StorageService,
    private readonly principalCache: AuthPrincipalCache,
  ) {}

  /**
   * The list's base, toolbar and keyword conditions, before any column selection. Null when
   * the role filter names a role nobody holds, so the list is empty.
   */
  private async listWhere(
    query: Pick<UserFilterDto, 'isActive' | 'roleCode' | 'search'>,
  ): Promise<FindOptionsWhere<User> | Array<FindOptionsWhere<User>> | null> {
    const baseConditions: Record<string, unknown> = { isDeleted: false };
    if (query.isActive !== undefined) {
      baseConditions.isActive = query.isActive;
    }
    if (query.roleCode) {
      const ids = await this.userIdsWithRole(query.roleCode);
      if (ids.length === 0) return null;
      baseConditions.id = ids.length === 1 ? ids[0] : In(ids);
    }

    return buildIlikeOrWhere(baseConditions, SEARCHABLE_COLUMNS, query.search);
  }

  /**
   * The list's query with every toolbar, keyword, column filter and sort applied, before paging
   * or column selection. Null when the role filter names a role nobody holds.
   */
  private async buildListQuery(
    query: UserFilterDto,
    select: FindOptionsSelect<User>,
  ): Promise<SelectQueryBuilder<User> | null> {
    const where = await this.listWhere(query);
    if (!where) return null;

    // A query builder rather than find options: the role column filter matches through
    // another table and the last-sign-in one compares a formatted day, neither of which a
    // find-options condition can express — merged into find options they were dropped.
    const qb = this.userRepo
      .createQueryBuilder(USER_ALIAS)
      .setFindOptions({ where, select });
    applyColumnFilterQuery(
      qb,
      USER_ALIAS,
      USER_COLUMN_FILTERS,
      query.columnFilters,
    );
    const sortExpression = query.sortBy
      ? SORT_EXPRESSIONS[query.sortBy]
      : undefined;
    if (sortExpression) {
      const direction = query.sortOrder === 'DESC' ? 'DESC' : 'ASC';
      qb.orderBy(sortExpression, direction, 'NULLS LAST')
        // A page of a list ordered by something every row shares needs a tiebreaker, or the
        // same account can appear on two pages and another on none.
        .addOrderBy('"account"."id"', direction);
    } else {
      applyColumnSort(qb, {
        alias: USER_ALIAS,
        map: USER_COLUMN_FILTERS,
        query,
        // Unsorted, the newest-created account comes first.
        fallback: { sql: `${USER_ALIAS}.createdAt`, direction: 'DESC' },
      });
    }
    return qb;
  }

  async findAll(query: UserFilterDto = {}) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );

    const qb = await this.buildListQuery(query, LIST_SELECT);
    // No holder of the role means an empty page, not an unfiltered one.
    if (!qb) return paginate<UserListItem>([], 0, page, limit);

    // `offset`/`limit` rather than `skip`/`take`: the latter wraps the query in a DISTINCT
    // subquery that cannot see an expression it is ordered by. Nothing is joined here, so
    // paging the rows directly is exact.
    const [data, total] = await qb.offset(skip).limit(take).getManyAndCount();

    return paginate(await this.withRoles(data), total, page, limit);
  }

  /**
   * Every account the list's search, toolbar, column filters and sort match, for the Excel
   * export. Only what the table can show as text: no credentials, tokens or image keys.
   */
  async findAllForExport(query: UserFilterDto): Promise<UserExportRow[]> {
    const qb = await this.buildListQuery(query, EXPORT_SELECT);
    if (!qb) return [];

    const users = await qb.getMany();
    const roles = await this.roleNamesByUser(users.map((user) => user.id));
    return users.map((user) => ({
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      roleName: roles.get(user.id) ?? null,
      department: user.department,
      phone: user.phone,
      title: user.title,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    }));
  }

  /** How many rows {@link findAllForExport} would return, for the export row cap. */
  async countForExport(query: UserFilterDto): Promise<number> {
    const qb = await this.buildListQuery(query, { id: true });
    return qb ? qb.getCount() : 0;
  }

  /**
   * Distinct values of one filterable column, for the list table's column filter — those of
   * the accounts the list shows under its keyword, toolbar and the other columns' selections.
   */
  async findColumnValues(query: UserColumnValuesQueryDto) {
    const where = await this.listWhere(toListScopeQuery(query));
    if (!where) {
      const { page, limit } = resolvePagination(query);
      return paginate<string>([], 0, page, limit);
    }
    return findColumnValues(this.userRepo, query, {
      alias: USER_ALIAS,
      map: USER_COLUMN_FILTERS,
      applyBaseWhere: (qb, alias) => applyListWhere(qb, alias, User, where),
    });
  }

  async findOne(id: number): Promise<UserListItem> {
    const user = await this.userRepo.findOne({
      where: { id, isDeleted: false },
      select: LIST_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    const [item] = await this.withRoles([user]);
    return item;
  }

  async create(dto: CreateUserDto, actorId: number) {
    const saved = await this.createRecord(dto, actorId);
    return this.findOne(saved.id);
  }

  /**
   * The create itself, on `manager` when the caller owns the transaction (the Excel import
   * writes a whole file in one), so every check and write of one account lands on it.
   */
  async createRecord(
    dto: CreateUserDto,
    actorId: number,
    manager?: EntityManager,
  ): Promise<User> {
    const userRepo = manager ? manager.getRepository(User) : this.userRepo;
    const roleRepo = manager ? manager.getRepository(Role) : this.roleRepo;
    const userRoleRepo = manager
      ? manager.getRepository(UserRole)
      : this.userRoleRepo;

    await this.assertIdentityFree(dto.username, dto.email, undefined, userRepo);
    const role = await this.roleByCode(dto.roleCode, roleRepo);

    const user = userRepo.create({
      username: dto.username,
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone ?? null,
      department: dto.department ?? null,
      title: dto.title ?? null,
      isActive: dto.isActive ?? true,
      // No password means no usable hash: the holder sets their own from the reset link the
      // controller mails, so nobody else ever knows it.
      passwordHash: dto.password
        ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
        : await bcrypt.hash(unusableSecret(), BCRYPT_ROUNDS),
      createdBy: actorId,
      isDeleted: false,
      metadata: {},
    });

    const saved = await userRepo.save(user);
    await this.assignRole(saved.id, role.id, actorId, userRoleRepo);
    return saved;
  }

  async update(id: number, dto: UpdateUserDto, actorId: number) {
    const user = await this.loadAccount(id);

    if (dto.username !== undefined && dto.username !== user.username) {
      await this.assertIdentityFree(dto.username, undefined, id);
      user.username = dto.username;
    }
    if (dto.email !== undefined && dto.email !== user.email) {
      await this.assertIdentityFree(undefined, dto.email, id);
      user.email = dto.email;
    }
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.phone !== undefined) user.phone = dto.phone ?? null;
    if (dto.department !== undefined) user.department = dto.department ?? null;
    if (dto.title !== undefined) user.title = dto.title ?? null;
    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;
      if (!dto.isActive) user.refreshToken = null;
    }
    user.updatedBy = actorId;
    await this.userRepo.save(user);
    if (dto.isActive === false) {
      await revokeUserSessions(this.sessionRepo, user.id, { actorId });
    }

    if (dto.roleCode) {
      const role = await this.roleByCode(dto.roleCode);
      await this.assignRole(id, role.id, actorId);
    }
    this.principalCache.invalidateUser(id);

    return this.findOne(id);
  }

  /**
   * Deactivates or restores an account (function list 1.8). A deactivated account keeps its
   * history — nothing is deleted — but loses every session with its refresh token.
   */
  async setActive(id: number, dto: SetUserActiveDto, actorId: number) {
    const user = await this.loadAccount(id);
    if (!dto.isActive && user.id === actorId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    user.isActive = dto.isActive;
    if (!dto.isActive) user.refreshToken = null;
    user.updatedBy = actorId;
    await this.userRepo.save(user);
    if (!dto.isActive) {
      await revokeUserSessions(this.sessionRepo, user.id, { actorId });
    }
    this.principalCache.invalidateUser(user.id);

    return this.findOne(id);
  }

  /**
   * Deactivates every ticked account, reporting per row.
   *
   * One refused row — the administrator's own account among them — must not cost the batch
   * the rest, so the outcome carries both halves the way a bulk delete does.
   */
  async bulkDeactivate(
    ids: number[],
    actorId: number,
  ): Promise<{
    deleted: number[];
    failed: Array<{ id: number; message: string }>;
  }> {
    const deleted: number[] = [];
    const failed: Array<{ id: number; message: string }> = [];

    for (const id of ids) {
      try {
        await this.setActive(id, { isActive: false }, actorId);
        deleted.push(id);
      } catch (error) {
        failed.push({
          id,
          message:
            error instanceof Error ? error.message : 'Account not deactivated',
        });
      }
    }

    return { deleted, failed };
  }

  /**
   * Soft-deletes an account. Unlike deactivation the row leaves the list for good, but the
   * records it created keep pointing at it, so history stays readable.
   *
   * The username and email go back into circulation with it — both unique indexes cover live
   * rows only — and every session it holds is dropped, so the holder is out at once rather
   * than until its access token expires.
   */
  async remove(id: number, actorId: number): Promise<{ id: number }> {
    const user = await this.loadAccount(id);
    if (user.id === actorId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    user.isActive = false;
    user.refreshToken = null;
    user.updatedBy = actorId;
    await this.userRepo.save(user);
    await revokeUserSessions(this.sessionRepo, user.id, { actorId });

    // The role assignment carries no soft-delete flag of its own; leaving it would hand the
    // role straight back to a new account reusing the freed id.
    await this.userRoleRepo.delete({ userId: user.id });
    this.principalCache.invalidateUser(user.id);

    return softDeleteWithAudit(this.userRepo, user, actorId);
  }

  /** Soft-deletes the accounts ticked in the list, each through `remove` and its guards. */
  removeMany(ids: number[], actorId: number) {
    return bulkSoftDelete(ids, (id) => this.remove(id, actorId));
  }

  /**
   * Sets another account's password. For the case the self-service flow cannot cover — a user
   * whose mailbox is unreachable, or an account handed over. Every session the account holds
   * is dropped with it, including the refresh token, so the previous holder loses access at
   * the same moment the new password takes effect.
   */
  async resetPassword(
    id: number,
    dto: AdminResetPasswordDto,
  ): Promise<{ success: true }> {
    const user = await this.loadAccount(id);

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    user.refreshToken = null;
    await this.userRepo.save(user);
    await revokeUserSessions(this.sessionRepo, user.id);
    this.principalCache.invalidateUser(user.id);

    return { success: true };
  }

  /** The role codes and names an administrator may assign, for the form's role picker. */
  findAssignableRoles() {
    return this.roleRepo.find({
      where: { isDeleted: false },
      select: { id: true, code: true, name: true, description: true },
      order: { name: 'ASC' },
    });
  }

  /**
   * One query for the whole page's role assignments, rather than one per row. The avatar and
   * signature storage keys are swapped for signed links here too, so the list can show them.
   */
  private async withRoles(
    users: Array<Partial<User>>,
  ): Promise<UserListItem[]> {
    const ids = users
      .map((user) => user.id)
      .filter((id): id is number => typeof id === 'number');
    if (ids.length === 0) return [];

    const byUser = await this.assignmentsByUser(ids);

    return Promise.all(
      users.map(async (user) => {
        const assignment =
          user.id === undefined ? undefined : byUser.get(user.id);
        return {
          ...(user as UserListItem),
          avatarUrl: await resolveStoredImageUrl(this.s3, user.avatarUrl),
          signatureUrl: await resolveStoredImageUrl(this.s3, user.signatureUrl),
          pendingSignatureUrl: await resolveStoredImageUrl(
            this.s3,
            user.pendingSignatureUrl,
          ),
          roleCode: assignment?.role?.code ?? null,
          roleName: assignment?.role?.name ?? null,
        };
      }),
    );
  }

  /** The first assignment of each account — the one the list shows. */
  private async assignmentsByUser(
    ids: number[],
  ): Promise<Map<number, UserRole>> {
    const byUser = new Map<number, UserRole>();
    if (ids.length === 0) return byUser;

    const assignments = await this.userRoleRepo.find({
      where: { userId: ids.length === 1 ? ids[0] : In(ids) },
      relations: ['role'],
    });
    for (const assignment of assignments) {
      if (!byUser.has(assignment.userId)) {
        byUser.set(assignment.userId, assignment);
      }
    }
    return byUser;
  }

  private async roleNamesByUser(ids: number[]): Promise<Map<number, string>> {
    const names = new Map<number, string>();
    for (const [userId, assignment] of await this.assignmentsByUser(ids)) {
      if (assignment.role?.name) names.set(userId, assignment.role.name);
    }
    return names;
  }

  private async userIdsWithRole(roleCode: string): Promise<number[]> {
    const role = await this.roleRepo.findOne({
      where: { code: roleCode, isDeleted: false },
      select: { id: true },
    });
    if (!role) return [];
    const assignments = await this.userRoleRepo.find({
      where: { roleId: role.id },
      select: { userId: true },
    });
    return assignments.map((assignment) => assignment.userId);
  }

  /** One role per account: the assignment replaces whatever was there. */
  private async assignRole(
    userId: number,
    roleId: number,
    actorId: number,
    userRoleRepo: Repository<UserRole> = this.userRoleRepo,
  ) {
    await userRoleRepo.delete({ userId });
    await userRoleRepo.save(
      userRoleRepo.create({ userId, roleId, assignedBy: actorId }),
    );
  }

  private async roleByCode(
    code: string,
    roleRepo: Repository<Role> = this.roleRepo,
  ): Promise<Role> {
    const role = await roleRepo.findOne({
      where: { code, isDeleted: false },
    });
    if (!role) throw new BadRequestException(`Unknown role code: ${code}`);
    return role;
  }

  private async loadAccount(id: number): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Both columns are unique in the database; checking first turns the driver's constraint
   * error into a message the form can put on the offending field.
   */
  private async assertIdentityFree(
    username?: string,
    email?: string,
    exceptUserId?: number,
    userRepo: Repository<User> = this.userRepo,
  ): Promise<void> {
    if (username) {
      const existing = await userRepo.findOne({
        where: { username, isDeleted: false },
        select: { id: true },
      });
      if (existing && existing.id !== exceptUserId) {
        throw new ConflictException('Username is already in use');
      }
    }
    if (email) {
      const existing = await userRepo.findOne({
        where: { email, isDeleted: false },
        select: { id: true },
      });
      if (existing && existing.id !== exceptUserId) {
        throw new ConflictException('Email is already in use');
      }
    }
  }
}
