import {
  BadRequestException,
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
import { assertMasterDataCodeUnchanged } from '@shared/utils/master-data-code.util';
import { resolvePagination } from '@shared/utils/pagination.util';
import { findActiveByIdOrThrow } from '@shared/utils/repository.util';
import { softDeleteWithAudit } from '@shared/utils/soft-delete.util';
import { buildIlikeOrWhere } from '@shared/utils/typeorm-search.util';
import { assertCaseInsensitiveUnique } from '@shared/utils/unique-field.util';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import {
  requireText,
  trimToNull,
} from '@plugins/catalog/_shared/utils/text.util';
import { CreateItemDto } from '@plugins/catalog/item/dto/create-item.dto';
import {
  ItemColumnValuesQueryDto,
  ItemFilterDto,
} from '@plugins/catalog/item/dto/item-filter.dto';
import { UpdateItemDto } from '@plugins/catalog/item/dto/update-item.dto';
import { Item } from '@plugins/catalog/item/entities/item.entity';
import { ITEM_GROUPS } from '@plugins/catalog/item/enums/item-group.enum';
import {
  assertCodeNotABarcode,
  lockItemIdentifiers,
} from '@plugins/catalog/item/utils/item-identifier.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/** Columns the list table filters and enumerates values for. Text columns only. */
export const ITEM_COLUMN_FILTERS: ColumnFilterMap = {
  code: { field: 'code' },
  name: { field: 'name' },
  brand: { field: 'brand' },
  group: { field: 'group' },
  unit: { field: 'unit' },
};

const ITEM_LABEL = 'Item';
const CODE_EXISTS_MESSAGE = 'Item code already exists.';
const REFERENCED_MESSAGE =
  'Cannot delete item because it is referenced by sales documents.';

@Injectable()
export class ItemService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    private readonly referenceChecks: ReferenceCheckRegistry,
  ) {}

  private listWhere(query: Pick<ItemFilterDto, 'search'>) {
    return buildIlikeOrWhere(
      { isDeleted: false },
      ['code', 'name', 'brand', 'specification'],
      query.search,
    );
  }

  async findAll(query: ItemFilterDto) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const where = mergeColumnFilterConditions(
      this.listWhere(query),
      ITEM_COLUMN_FILTERS,
      query.columnFilters,
    );
    const order = toColumnSortOrder<Item>({
      map: ITEM_COLUMN_FILTERS,
      query,
      fallback: { field: 'createdAt', direction: 'DESC' },
    });
    const [rows, total] = await this.itemRepo.findAndCount({
      where,
      skip,
      take,
      order,
    });
    return paginate(rows, total, page, limit);
  }

  /** Distinct values of one filterable column, limited to the rows the toolbar leaves. */
  findColumnValues(query: ItemColumnValuesQueryDto) {
    const where = this.listWhere(toListScopeQuery(query));
    return findColumnValues(this.itemRepo, query, {
      alias: 'item',
      map: ITEM_COLUMN_FILTERS,
      applyBaseWhere: (qb, alias) => applyListWhere(qb, alias, Item, where),
    });
  }

  findOne(id: number): Promise<Item> {
    return findActiveByIdOrThrow(this.itemRepo, id, ITEM_LABEL);
  }

  async create(dto: CreateItemDto, actor: AuthUserPayload): Promise<Item> {
    const code = requireText(dto.code, 'Item code is required.');
    const item = this.itemRepo.create({
      code,
      name: requireText(dto.name, 'Item name is required.'),
      specification: trimToNull(dto.specification),
      brand: trimToNull(dto.brand),
      group: dto.group,
      unit: requireText(dto.unit, 'Unit is required.'),
      referencePrice: dto.referencePrice ?? null,
      note: trimToNull(dto.note),
      createdBy: actor.userId,
      isDeleted: false,
    });
    try {
      return await this.itemRepo.manager.transaction(async (manager) => {
        const repo = manager.getRepository(Item);
        // A barcode set to this code in another transaction is invisible to the checks below
        // until it commits, so writers of one value queue up here first.
        await lockItemIdentifiers(manager, [code]);
        await this.assertCodeUnique(code, repo);
        await assertCodeNotABarcode(repo, code);
        return repo.save(item);
      });
    } catch (error: unknown) {
      return rethrowUniqueViolation(error, () => this.assertCodeUnique(code));
    }
  }

  async update(
    id: number,
    dto: UpdateItemDto,
    actor: AuthUserPayload,
  ): Promise<Item> {
    const item = await this.findOne(id);
    // An explicit null (PartialType lets it through) can never equal the stored code.
    if (dto.code !== undefined) {
      assertMasterDataCodeUnchanged(item.code, dto.code ?? '');
    }
    if (dto.name !== undefined) {
      item.name = requireText(dto.name, 'Item name is required.');
    }
    if (dto.specification !== undefined) {
      item.specification = trimToNull(dto.specification);
    }
    if (dto.brand !== undefined) item.brand = trimToNull(dto.brand);
    if (dto.group !== undefined) {
      if (!ITEM_GROUPS.includes(dto.group)) {
        throw new BadRequestException('Item group is invalid.');
      }
      item.group = dto.group;
    }
    if (dto.unit !== undefined) {
      item.unit = requireText(dto.unit, 'Unit is required.');
    }
    if (dto.referencePrice !== undefined) {
      item.referencePrice = dto.referencePrice;
    }
    if (dto.note !== undefined) item.note = trimToNull(dto.note);
    item.updatedBy = actor.userId;
    return this.itemRepo.save(item);
  }

  /**
   * Deletes an unreferenced item. The row is locked for the whole check-and-delete, and a
   * document adding a line for the item takes a shared lock on it, so the two serialise: either
   * the line is committed before the check runs (and the delete is refused), or the delete
   * commits first (and the document refuses the gone item).
   */
  remove(id: number, actor: AuthUserPayload) {
    return this.itemRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Item);
      const item = await repo.findOne({
        where: { id, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException(`${ITEM_LABEL} ${id} not found`);

      const referencedBy = await this.referenceChecks.referencingItem(id);
      if (referencedBy.length > 0) {
        throw new ConflictException(REFERENCED_MESSAGE);
      }
      return softDeleteWithAudit(repo, item, actor.userId);
    });
  }

  /** Soft-deletes the rows ticked in the list, each through `remove` and its own guards. */
  removeMany(ids: number[], actor: AuthUserPayload) {
    return bulkSoftDelete(ids, (id) => this.remove(id, actor));
  }

  private assertCodeUnique(
    code: string,
    repo: Repository<Item> = this.itemRepo,
  ): Promise<void> {
    // Active rows only: the unique index is partial, so a deleted item's code is reusable.
    return assertCaseInsensitiveUnique(repo, {
      field: 'code',
      value: code,
      message: CODE_EXISTS_MESSAGE,
    });
  }
}
