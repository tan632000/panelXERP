import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Role } from '@kernel/core/users/entities/role.entity';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { DataScopeService } from '@shared/services/data-scope.service';
import { bulkSoftDelete } from '@shared/utils/bulk-delete.util';
import {
  applyListWhere,
  findColumnValues,
  mergeColumnFilterConditions,
  toListScopeQuery,
  type ColumnFilterMap,
} from '@shared/utils/column-filter.util';
import { toColumnSortOrder } from '@shared/utils/column-sort.util';
import { rethrowUniqueViolation } from '@shared/utils/db-error.util';
import { assertMasterDataCodeUnchanged } from '@shared/utils/master-data-code.util';
import { previewMaxBasedCode } from '@shared/utils/max-based-code.util';
import { resolvePagination } from '@shared/utils/pagination.util';
import { softDeleteWithAudit } from '@shared/utils/soft-delete.util';
import { buildIlikeOrWhere } from '@shared/utils/typeorm-search.util';
import { assertCaseInsensitiveUnique } from '@shared/utils/unique-field.util';

import { CustomerOwnerChangeRegistry } from '@plugins/crm/_shared/gateways/customer-owner-change-registry';
import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { ownerCondition } from '@plugins/crm/_shared/utils/owner-scope.util';
import { requireText, trimToNull } from '@plugins/crm/_shared/utils/text.util';
import {
  CUSTOMER_CODE_PREFIX,
  SALES_OWNER_ROLE_CODES,
} from '@plugins/crm/customer/constants/customer-code.constant';
import { CreateCustomerDto } from '@plugins/crm/customer/dto/create-customer.dto';
import {
  CustomerColumnValuesQueryDto,
  CustomerFilterDto,
} from '@plugins/crm/customer/dto/customer-filter.dto';
import { UpdateCustomerDto } from '@plugins/crm/customer/dto/update-customer.dto';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/** Columns the list table filters and enumerates values for. Text columns only. */
export const CUSTOMER_COLUMN_FILTERS: ColumnFilterMap = {
  code: { field: 'code' },
  name: { field: 'name' },
  taxCode: { field: 'taxCode' },
  address: { field: 'address' },
  phone: { field: 'phone' },
  email: { field: 'email' },
};

/** A customer as the API returns it: the row plus the owner's display name. */
export type CustomerView = Customer & { salesOwnerName: string | null };

export interface CustomerOwnerOption {
  id: number;
  fullName: string;
}

const CUSTOMER_LABEL = 'Customer';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataScope: DataScopeService,
    private readonly referenceChecks: ReferenceCheckRegistry,
    private readonly ownerChanges: CustomerOwnerChangeRegistry,
  ) {}

  /** The list's keyword and owner-scope conditions, before any column selection. */
  private listWhere(
    query: Pick<CustomerFilterDto, 'search'>,
    actor: AuthUserPayload,
  ) {
    const base: Record<string, unknown> = {
      isDeleted: false,
      ...ownerCondition(this.dataScope.scopeOf(actor), actor.userId),
    };
    return buildIlikeOrWhere(
      base,
      ['code', 'name', 'taxCode', 'address', 'phone', 'email'],
      query.search,
    );
  }

  async findAll(query: CustomerFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );

    const where = mergeColumnFilterConditions(
      this.listWhere(query, actor),
      CUSTOMER_COLUMN_FILTERS,
      query.columnFilters,
    );
    const order = toColumnSortOrder<Customer>({
      map: CUSTOMER_COLUMN_FILTERS,
      query,
      fallback: { field: 'createdAt', direction: 'DESC' },
    });

    const [rows, total] = await this.customerRepo.findAndCount({
      where,
      skip,
      take,
      order,
    });

    return paginate(await this.withOwnerNames(rows), total, page, limit);
  }

  /** Distinct values of one filterable column, limited to the customers the actor can see. */
  findColumnValues(
    query: CustomerColumnValuesQueryDto,
    actor: AuthUserPayload,
  ) {
    const where = this.listWhere(toListScopeQuery(query), actor);
    return findColumnValues(this.customerRepo, query, {
      alias: 'customer',
      map: CUSTOMER_COLUMN_FILTERS,
      applyBaseWhere: (qb, alias) => applyListWhere(qb, alias, Customer, where),
    });
  }

  async findOne(id: number, actor: AuthUserPayload): Promise<CustomerView> {
    const customer = await this.findVisible(id, actor);
    const [view] = await this.withOwnerNames([customer]);
    return view;
  }

  async create(
    dto: CreateCustomerDto,
    actor: AuthUserPayload,
  ): Promise<CustomerView> {
    const code = dto.code.trim();
    await this.assertCodeUnique(code);

    const salesOwnerId = dto.salesOwnerId ?? actor.userId;
    await this.assertMayAssignOwner(actor, salesOwnerId);

    const customer = this.customerRepo.create({
      code,
      name: requireText(dto.name, 'Customer name is required.'),
      taxCode: trimToNull(dto.taxCode),
      address: trimToNull(dto.address),
      phone: trimToNull(dto.phone),
      email: trimToNull(dto.email),
      salesOwnerId,
      note: trimToNull(dto.note),
      createdBy: actor.userId,
      isDeleted: false,
    });

    try {
      const saved = await this.customerRepo.save(customer);
      const [view] = await this.withOwnerNames([saved]);
      return view;
    } catch (error: unknown) {
      return rethrowUniqueViolation(error, () => this.assertCodeUnique(code));
    }
  }

  async update(
    id: number,
    dto: UpdateCustomerDto,
    actor: AuthUserPayload,
  ): Promise<CustomerView> {
    const customer = await this.findVisible(id, actor);

    assertMasterDataCodeUnchanged(customer.code, dto.code);

    if (dto.name !== undefined) {
      customer.name = requireText(dto.name, 'Customer name is required.');
    }
    if (dto.taxCode !== undefined) customer.taxCode = trimToNull(dto.taxCode);
    if (dto.address !== undefined) customer.address = trimToNull(dto.address);
    if (dto.phone !== undefined) customer.phone = trimToNull(dto.phone);
    if (dto.email !== undefined) customer.email = trimToNull(dto.email);
    if (dto.note !== undefined) customer.note = trimToNull(dto.note);
    // A null owner is not a clear request (the owner is mandatory): it changes nothing.
    let newOwnerId: number | null = null;
    if (
      dto.salesOwnerId !== undefined &&
      dto.salesOwnerId !== null &&
      dto.salesOwnerId !== customer.salesOwnerId
    ) {
      await this.assertMayAssignOwner(actor, dto.salesOwnerId);
      newOwnerId = dto.salesOwnerId;
    }
    customer.updatedBy = actor.userId;

    // A new owner takes the customer's documents with it, in the same transaction: a request
    // left with the old owner would be invisible to the one who now owns the customer.
    const saved =
      newOwnerId === null
        ? await this.customerRepo.save(customer)
        : await this.customerRepo.manager.transaction(async (manager) => {
            customer.salesOwnerId = newOwnerId;
            const updated = await manager
              .getRepository(Customer)
              .save(customer);
            await this.ownerChanges.apply(manager, customer.id, newOwnerId);
            return updated;
          });
    const [view] = await this.withOwnerNames([saved]);
    return view;
  }

  async remove(id: number, actor: AuthUserPayload) {
    const customer = await this.findVisible(id, actor);

    const referencedBy = await this.referenceChecks.referencingCustomer(id);
    if (referencedBy.length > 0) {
      throw new ConflictException(
        'Cannot delete customer because it is referenced by sales documents.',
      );
    }

    return softDeleteWithAudit(this.customerRepo, customer, actor.userId);
  }

  /** Soft-deletes the rows ticked in the list, each through `remove` and its own guards. */
  removeMany(ids: number[], actor: AuthUserPayload) {
    return bulkSoftDelete(ids, (id) => this.remove(id, actor));
  }

  async getNextCode(): Promise<{ code: string }> {
    const code = await previewMaxBasedCode(this.customerRepo.manager, {
      table: 'customers',
      prefix: CUSTOMER_CODE_PREFIX,
    });
    return { code };
  }

  /**
   * The accounts the actor may name as owner: the sales accounts for an actor who sees every
   * customer, otherwise only the actor, who cannot hand a customer to anyone else.
   */
  async listOwnerOptions(
    actor: AuthUserPayload,
  ): Promise<CustomerOwnerOption[]> {
    if (this.dataScope.scopeOf(actor) !== 'all') {
      const self = await this.userRepo.findOne({
        where: { id: actor.userId },
        select: { id: true, fullName: true },
      });
      return self ? [{ id: self.id, fullName: self.fullName }] : [];
    }

    const owners = await this.ownerCandidates()
      .select(['owner.id', 'owner.fullName'])
      .orderBy('owner.fullName', 'ASC')
      .getMany();
    return owners.map((owner) => ({ id: owner.id, fullName: owner.fullName }));
  }

  /** Reads the customer through the actor's data scope: out of scope answers 404. */
  private async findVisible(
    id: number,
    actor: AuthUserPayload,
  ): Promise<Customer> {
    const customer = await this.customerRepo.findOne({
      where: { id, isDeleted: false },
    });
    return this.dataScope.assertVisible(actor, customer, CUSTOMER_LABEL);
  }

  /**
   * Only an actor who sees every customer may give one to another account, and only to an
   * active sales account; anyone else owns what they create.
   */
  private async assertMayAssignOwner(
    actor: AuthUserPayload,
    ownerId: number,
  ): Promise<void> {
    if (ownerId === actor.userId) return;

    if (this.dataScope.scopeOf(actor) !== 'all') {
      throw new BadRequestException(
        'Only a sales manager or director may assign a customer to another sales account.',
      );
    }

    const eligible = await this.ownerCandidates()
      .andWhere('owner.id = :ownerId', { ownerId })
      .getExists();
    if (!eligible) {
      throw new BadRequestException(
        'Sales owner must be an active sales account.',
      );
    }
  }

  private ownerCandidates() {
    return this.userRepo
      .createQueryBuilder('owner')
      .innerJoin(UserRole, 'ownerRole', 'ownerRole.userId = owner.id')
      .innerJoin(Role, 'role', 'role.id = ownerRole.roleId')
      .where('owner.isDeleted = false')
      .andWhere('owner.isActive = true')
      .andWhere('role.code IN (:...roleCodes)', {
        roleCodes: [...SALES_OWNER_ROLE_CODES],
      });
  }

  private assertCodeUnique(code: string): Promise<void> {
    // Active rows only: the unique index is partial, so a deleted customer's code is reusable.
    return assertCaseInsensitiveUnique(this.customerRepo, {
      field: 'code',
      value: code,
      message: 'Customer code already exists.',
    });
  }

  private async withOwnerNames(rows: Customer[]): Promise<CustomerView[]> {
    const ownerIds = [...new Set(rows.map((row) => row.salesOwnerId))];
    const owners =
      ownerIds.length === 0
        ? []
        : await this.userRepo.find({
            where: { id: In(ownerIds) },
            select: { id: true, fullName: true },
            withDeleted: true,
          });
    const nameById = new Map(owners.map((owner) => [owner.id, owner.fullName]));

    return rows.map((row) =>
      Object.assign(row, {
        salesOwnerName: nameById.get(row.salesOwnerId) ?? null,
      }),
    );
  }
}
