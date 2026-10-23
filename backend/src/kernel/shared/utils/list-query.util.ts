import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate, type PaginatedResult } from '@shared/dto/pagination.dto';
import { mergeColumnFilterConditions } from '@shared/utils/column-filter.util';
import { toColumnSortOrder } from '@shared/utils/column-sort.util';
import {
  resolvePagination,
  resolveSortOrder,
  type PaginationInput,
} from '@shared/utils/pagination.util';
import { buildIlikeOrWhere } from '@shared/utils/typeorm-search.util';

import type {
  ColumnFilterMap,
  ColumnFilterSelections,
} from '@shared/utils/column-filter.util';
import type { FindOptionsOrder, FindOptionsWhere, Repository } from 'typeorm';

export interface ListQueryInput extends PaginationInput {
  search?: string;
  /** Enum values whose translated label matched `search`; widens the keyword search. */
  searchClassifications?: string[];
  sortBy?: string;
  sortOrder?: string;
}

/** Master-data lists show the newest row first unless the caller asks otherwise. */
export const DEFAULT_LIST_SORT_FIELD = 'createdAt';

export interface ResolvedListSort {
  field: string;
  direction: 'ASC' | 'DESC';
}

/**
 * Which column a list sorts by, and in which direction.
 *
 * An absent or unsupported `sortBy` resolves to `createdAt` descending, so every
 * master-data list opens on the most recently created rows. An explicit sortable
 * column keeps the ascending default the API has always used, so a caller that
 * asks for `code` still gets `code` ascending.
 */
export function resolveListSort(
  query: Pick<ListQueryInput, 'sortBy' | 'sortOrder'>,
  sortableFields: readonly string[],
): ResolvedListSort {
  const requested = query.sortBy;
  const field =
    requested && sortableFields.includes(requested)
      ? requested
      : DEFAULT_LIST_SORT_FIELD;
  if (query.sortOrder) {
    return { field, direction: resolveSortOrder(query.sortOrder) };
  }

  // Newest-first only applies to the implicit default; an explicitly requested
  // column keeps the ascending default the API has always used.
  return {
    field,
    direction: field === DEFAULT_LIST_SORT_FIELD ? 'DESC' : 'ASC',
  };
}

/**
 * The sort as TypeORM find options.
 *
 * `id` breaks ties in the same direction: `created_at` is not unique — a seed or a
 * bulk import writes many rows on one timestamp — and a non-unique sort key lets
 * Postgres return a row twice across two pages, or skip it entirely.
 */
export function toListOrder<T extends object>(
  sort: ResolvedListSort,
): FindOptionsOrder<T> {
  const order: Record<string, 'ASC' | 'DESC'> = {
    [sort.field]: sort.direction,
    id: sort.direction,
  };
  return order as FindOptionsOrder<T>;
}

export async function findAndPaginate<T extends object>(
  repo: Repository<T>,
  query: ListQueryInput,
  options: {
    base: FindOptionsWhere<T>;
    searchFields: string[];
    /**
     * Sortable columns of a list that declares no filterable ones. A list carrying a
     * `columnFilters` map sorts by every column in it instead, reading the same definitions
     * the filters use so the two cannot drift apart.
     */
    sortableFields?: readonly string[];
    /** Columns of that map this list filters but will not sort by. */
    unsortableColumns?: readonly string[];
    defaultLimit?: number;
    /** Classification column that `query.searchClassifications` matches against. */
    enumSearchField?: string;
    /** Filterable table columns and the values the list table selected. */
    columnFilters?: {
      map: ColumnFilterMap;
      selections?: ColumnFilterSelections;
    };
  },
): Promise<PaginatedResult<T>> {
  const { page, limit, skip, take } = resolvePagination(
    query,
    options.defaultLimit ?? DEFAULT_LIST_PAGE_SIZE,
  );
  const map = options.columnFilters?.map;
  // A list that declares its filterable columns sorts by any of them; one that declares
  // none keeps the short sortable list it was written with.
  const order = map
    ? toColumnSortOrder<T>({
        map,
        query,
        fallback: { field: DEFAULT_LIST_SORT_FIELD, direction: 'DESC' },
        unsortable: options.unsortableColumns,
      })
    : toListOrder<T>(resolveListSort(query, options.sortableFields ?? []));

  const where = mergeColumnFilterConditions(
    buildIlikeOrWhere(
      options.base,
      options.searchFields,
      query.search,
      options.enumSearchField
        ? {
            field: options.enumSearchField,
            values: query.searchClassifications,
          }
        : undefined,
    ),
    options.columnFilters?.map ?? {},
    options.columnFilters?.selections,
  ) as FindOptionsWhere<T> | Array<FindOptionsWhere<T>>;

  const [data, total] = await repo.findAndCount({
    where,
    skip,
    take,
    order,
  });

  return paginate(data, total, page, limit);
}
