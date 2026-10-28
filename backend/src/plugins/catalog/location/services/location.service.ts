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

import {
  requireText,
  trimToNull,
} from '@plugins/catalog/_shared/utils/text.util';
import { Item } from '@plugins/catalog/item/entities/item.entity';
import { CreateLocationDto } from '@plugins/catalog/location/dto/create-location.dto';
import {
  LocationColumnValuesQueryDto,
  LocationFilterDto,
} from '@plugins/catalog/location/dto/location-filter.dto';
import { UpdateLocationDto } from '@plugins/catalog/location/dto/update-location.dto';
import { Location } from '@plugins/catalog/location/entities/location.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

/** Columns the list table filters and enumerates values for. Text columns only. */
export const LOCATION_COLUMN_FILTERS: ColumnFilterMap = {
  code: { field: 'code' },
  name: { field: 'name' },
};

const LOCATION_LABEL = 'Location';

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
  ) {}

  /** The list's keyword condition, before any column selection. */
  private listWhere(query: Pick<LocationFilterDto, 'search'>) {
    return buildIlikeOrWhere(
      { isDeleted: false },
      ['code', 'name', 'note'],
      query.search,
    );
  }

  async findAll(query: LocationFilterDto) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );

    const where = mergeColumnFilterConditions(
      this.listWhere(query),
      LOCATION_COLUMN_FILTERS,
      query.columnFilters,
    );
    const order = toColumnSortOrder<Location>({
      map: LOCATION_COLUMN_FILTERS,
      query,
      fallback: { field: 'code', direction: 'ASC' },
    });

    const [rows, total] = await this.locationRepo.findAndCount({
      where,
      skip,
      take,
      order,
    });

    return paginate(rows, total, page, limit);
  }

  /** Distinct values of one filterable column, limited to the rows the list shows. */
  findColumnValues(query: LocationColumnValuesQueryDto) {
    const where = this.listWhere(toListScopeQuery(query));
    return findColumnValues(this.locationRepo, query, {
      alias: 'location',
      map: LOCATION_COLUMN_FILTERS,
      applyBaseWhere: (qb, alias) => applyListWhere(qb, alias, Location, where),
    });
  }

  findOne(id: number): Promise<Location> {
    return findActiveByIdOrThrow(this.locationRepo, id, LOCATION_LABEL);
  }

  async create(
    dto: CreateLocationDto,
    actor: AuthUserPayload,
  ): Promise<Location> {
    const code = requireText(dto.code, 'Location code is required.');
    await this.assertCodeUnique(code);

    const location = this.locationRepo.create({
      code,
      name: requireText(dto.name, 'Location name is required.'),
      note: trimToNull(dto.note),
      isActive: dto.isActive ?? true,
      createdBy: actor.userId,
      isDeleted: false,
    });

    try {
      return await this.locationRepo.save(location);
    } catch (error: unknown) {
      return rethrowUniqueViolation(error, () => this.assertCodeUnique(code));
    }
  }

  async update(
    id: number,
    dto: UpdateLocationDto,
    actor: AuthUserPayload,
  ): Promise<Location> {
    const location = await this.findOne(id);

    if (dto.code !== undefined) {
      const newCode = requireText(dto.code, 'Location code is required.');
      if (newCode !== location.code) {
        await this.assertCodeUnique(newCode, id);
        location.code = newCode;
      }
    }
    if (dto.name !== undefined) {
      location.name = requireText(dto.name, 'Location name is required.');
    }
    if (dto.note !== undefined) location.note = trimToNull(dto.note);
    // A null flag is not a clear request (the flag is mandatory): it changes nothing.
    if (typeof dto.isActive === 'boolean') location.isActive = dto.isActive;
    location.updatedBy = actor.userId;

    try {
      return await this.locationRepo.save(location);
    } catch (error: unknown) {
      return rethrowUniqueViolation(error, () =>
        this.assertCodeUnique(location.code, id),
      );
    }
  }

  /**
   * Deletes a location no active item uses as its default. The row is locked for the whole
   * check-and-delete, and an item being pointed at the location takes the same lock first, so
   * either that item is committed before the check (and the delete is refused) or the delete
   * commits first (and the item is refused the gone location).
   */
  remove(id: number, actor: AuthUserPayload) {
    return this.locationRepo.manager.transaction(async (manager) => {
      const locations = manager.getRepository(Location);
      const location = await locations.findOne({
        where: { id, isDeleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!location) {
        throw new NotFoundException(`${LOCATION_LABEL} ${id} not found`);
      }

      const isDefault = await manager.getRepository(Item).exists({
        where: { defaultLocationId: id, isDeleted: false },
      });
      if (isDefault) {
        throw new ConflictException(
          'Cannot delete location because it is the default location of an item.',
        );
      }

      return softDeleteWithAudit(locations, location, actor.userId);
    });
  }

  /** Soft-deletes the rows ticked in the list, each through `remove` and its own guards. */
  removeMany(ids: number[], actor: AuthUserPayload) {
    return bulkSoftDelete(ids, (id) => this.remove(id, actor));
  }

  private assertCodeUnique(code: string, excludeId?: number): Promise<void> {
    // Active rows only: the unique index is partial, so a deleted location frees its code.
    return assertCaseInsensitiveUnique(this.locationRepo, {
      field: 'code',
      value: code,
      message: 'Location code already exists.',
      excludeId,
    });
  }
}
