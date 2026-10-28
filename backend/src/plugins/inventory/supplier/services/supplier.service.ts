import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
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
import { resolvePagination } from '@shared/utils/pagination.util';
import { findActiveByIdOrThrow } from '@shared/utils/repository.util';
import { softDeleteWithAudit } from '@shared/utils/soft-delete.util';
import { buildIlikeOrWhere } from '@shared/utils/typeorm-search.util';
import { assertCaseInsensitiveUnique } from '@shared/utils/unique-field.util';

import { SupplierReferenceCheckRegistry } from '@plugins/inventory/_shared/gateways/supplier-reference-check-registry';
import {
  requireText,
  trimToNull,
} from '@plugins/inventory/_shared/utils/text.util';
import { CreateSupplierDto } from '@plugins/inventory/supplier/dto/create-supplier.dto';
import {
  SupplierColumnValuesQueryDto,
  SupplierFilterDto,
} from '@plugins/inventory/supplier/dto/supplier-filter.dto';
import { UpdateSupplierDto } from '@plugins/inventory/supplier/dto/update-supplier.dto';
import { Supplier } from '@plugins/inventory/supplier/entities/supplier.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/** Columns the list table filters and enumerates values for. Text columns only. */
export const SUPPLIER_COLUMN_FILTERS: ColumnFilterMap = {
  code: { field: 'code' },
  name: { field: 'name' },
  taxCode: { field: 'taxCode' },
  contactName: { field: 'contactName' },
  phone: { field: 'phone' },
  email: { field: 'email' },
};

const SUPPLIER_LABEL = 'Supplier';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    private readonly referenceChecks: SupplierReferenceCheckRegistry,
  ) {}

  /** The list's keyword condition, before any column selection. */
  private listWhere(query: Pick<SupplierFilterDto, 'search'>) {
    return buildIlikeOrWhere(
      { isDeleted: false },
      ['code', 'name', 'taxCode', 'contactName', 'phone', 'email'],
      query.search,
    );
  }

  async findAll(query: SupplierFilterDto) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );

    const where = mergeColumnFilterConditions(
      this.listWhere(query),
      SUPPLIER_COLUMN_FILTERS,
      query.columnFilters,
    );
    const order = toColumnSortOrder<Supplier>({
      map: SUPPLIER_COLUMN_FILTERS,
      query,
      fallback: { field: 'createdAt', direction: 'DESC' },
    });

    const [rows, total] = await this.supplierRepo.findAndCount({
      where,
      skip,
      take,
      order,
    });

    return paginate(rows, total, page, limit);
  }

  /** Distinct values of one filterable column, limited to the rows the list shows. */
  findColumnValues(query: SupplierColumnValuesQueryDto) {
    const where = this.listWhere(toListScopeQuery(query));
    return findColumnValues(this.supplierRepo, query, {
      alias: 'supplier',
      map: SUPPLIER_COLUMN_FILTERS,
      applyBaseWhere: (qb, alias) => applyListWhere(qb, alias, Supplier, where),
    });
  }

  findOne(id: number): Promise<Supplier> {
    return findActiveByIdOrThrow(this.supplierRepo, id, SUPPLIER_LABEL);
  }

  async create(
    dto: CreateSupplierDto,
    actor: AuthUserPayload,
  ): Promise<Supplier> {
    const code = requireText(dto.code, 'Supplier code is required.');
    await this.assertCodeUnique(code);

    const supplier = this.supplierRepo.create({
      code,
      name: requireText(dto.name, 'Supplier name is required.'),
      taxCode: trimToNull(dto.taxCode),
      address: trimToNull(dto.address),
      phone: trimToNull(dto.phone),
      email: trimToNull(dto.email),
      contactName: trimToNull(dto.contactName),
      note: trimToNull(dto.note),
      isActive: dto.isActive ?? true,
      createdBy: actor.userId,
      isDeleted: false,
    });

    try {
      return await this.supplierRepo.save(supplier);
    } catch (error: unknown) {
      return rethrowUniqueViolation(error, () => this.assertCodeUnique(code));
    }
  }

  async update(
    id: number,
    dto: UpdateSupplierDto,
    actor: AuthUserPayload,
  ): Promise<Supplier> {
    const supplier = await this.findOne(id);

    if (dto.code !== undefined) {
      const newCode = requireText(dto.code, 'Supplier code is required.');
      if (newCode !== supplier.code) {
        await this.assertCodeUnique(newCode, id);
        supplier.code = newCode;
      }
    }
    if (dto.name !== undefined) {
      supplier.name = requireText(dto.name, 'Supplier name is required.');
    }
    if (dto.taxCode !== undefined) supplier.taxCode = trimToNull(dto.taxCode);
    if (dto.address !== undefined) supplier.address = trimToNull(dto.address);
    if (dto.phone !== undefined) supplier.phone = trimToNull(dto.phone);
    if (dto.email !== undefined) supplier.email = trimToNull(dto.email);
    if (dto.contactName !== undefined) {
      supplier.contactName = trimToNull(dto.contactName);
    }
    if (dto.note !== undefined) supplier.note = trimToNull(dto.note);
    // A null flag is not a clear request (the flag is mandatory): it changes nothing.
    if (typeof dto.isActive === 'boolean') {
      supplier.isActive = dto.isActive;
    }
    supplier.updatedBy = actor.userId;

    try {
      return await this.supplierRepo.save(supplier);
    } catch (error: unknown) {
      return rethrowUniqueViolation(error, () =>
        this.assertCodeUnique(supplier.code, id),
      );
    }
  }

  /**
   * Deletes an unreferenced supplier. The row is locked for the whole check-and-delete, and a
   * purchase order naming the supplier takes a shared lock on it, so the two serialise: either
   * the order is committed before the check runs (and the delete is refused), or the delete
   * commits first (and the order refuses the gone supplier).
   */
  remove(id: number, actor: AuthUserPayload) {
    return this.supplierRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Supplier);
      const supplier = await repo.findOne({
        where: { id, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!supplier) {
        throw new NotFoundException(`${SUPPLIER_LABEL} ${id} not found`);
      }

      const referencedBy = await this.referenceChecks.referencing(id);
      if (referencedBy.length > 0) {
        throw new ConflictException(
          'Cannot delete supplier because it is referenced by purchasing documents.',
        );
      }

      return softDeleteWithAudit(repo, supplier, actor.userId);
    });
  }

  /** Soft-deletes the rows ticked in the list, each through `remove` and its own guards. */
  removeMany(ids: number[], actor: AuthUserPayload) {
    return bulkSoftDelete(ids, (id) => this.remove(id, actor));
  }

  private assertCodeUnique(code: string, excludeId?: number): Promise<void> {
    // Active rows only: the unique index is partial, so a deleted supplier's code is reusable.
    return assertCaseInsensitiveUnique(this.supplierRepo, {
      field: 'code',
      value: code,
      message: 'Supplier code already exists.',
      excludeId,
    });
  }
}
