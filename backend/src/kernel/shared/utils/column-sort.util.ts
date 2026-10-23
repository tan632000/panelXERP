import {
  columnSql,
  ensureRelationJoin,
  existsJoinSql,
  existsSources,
  existsValueSql,
  jsonbIdSelect,
} from '@shared/utils/column-filter.util';
import { resolveSortOrder } from '@shared/utils/pagination.util';

import type {
  ColumnFilterDefinition,
  ColumnFilterMap,
} from '@shared/utils/column-filter.util';
import type {
  FindOptionsOrder,
  ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';

/** The sort a list query carries, as `SortableListFilterQueryDto` declares it. */
export interface ColumnSortQuery {
  sortBy?: string;
  sortOrder?: string;
}

/**
 * The order a list falls back to when the caller asks for no column, or for one this list
 * cannot sort by. It is the order the list already had, so an unsorted screen is unchanged.
 */
export interface DefaultListOrder {
  /** Written against the list alias, e.g. `mold.created_at`. */
  sql: string;
  direction: 'ASC' | 'DESC';
}

/**
 * Sortable beyond the filterable columns: every list has always accepted `createdAt`, and a
 * client sending it must keep working now that the sortable set comes from the filter map.
 *
 * It also keeps its descending default from `resolveListSort`: asking for `createdAt` without
 * a direction has always meant newest first, and a caller sending only `sortBy` must not
 * silently flip to oldest first.
 */
const BASE_SORTABLE_FIELDS = ['createdAt'] as const;

function isBaseSortableField(column: string): boolean {
  return (BASE_SORTABLE_FIELDS as readonly string[]).includes(column);
}

export interface ColumnSortOptions {
  /** Alias the list's own columns are addressed through. */
  alias: string;
  /** The list's filterable columns; sorting reads the same SQL so the two cannot drift. */
  map: ColumnFilterMap;
  query: ColumnSortQuery;
  fallback: DefaultListOrder;
  /**
   * Columns this list filters but will not sort by — a cell whose order carries no meaning,
   * or one too costly to order by. Listed here rather than removed from the filter map.
   */
  unsortable?: readonly string[];
  /**
   * Sortable columns the table does not filter by, keyed the way the API takes them, with
   * the SQL or property path ordering each. For a sort the API has always accepted on a
   * value the list does not show as its own column.
   */
  extra?: Record<string, string>;
  /**
   * What breaks a tie, when the list's own rows are not its entity's rows. A list showing one
   * row per document line orders by the line, so that its lines keep their order inside a
   * document however the documents themselves are sorted. Defaults to `<alias>.id`.
   */
  tieBreak?: string;
}

export interface ResolvedColumnSort {
  /** The column being sorted by, or null while the list keeps its default order. */
  column: string | null;
  direction: 'ASC' | 'DESC';
  /** What the ORDER BY addresses: a property path, or SQL for a composed column. */
  sql: string;
  /** True while `sql` is raw SQL, selected under {@link LIST_SORT_ALIAS} to be ordered by. */
  isExpression: boolean;
}

/**
 * Output name a raw-SQL sort is selected under.
 *
 * TypeORM paginates a query with joins by first selecting distinct ids, and builds that
 * query's ORDER BY by splitting each key on `.` and resolving what precedes it as a join
 * alias. Raw SQL has no such alias and the query fails to build, so a composed or
 * multi-valued column is selected under this name — which carries no dot — and ordered by
 * the name instead. Postgres resolves it to the same output column on the simpler path.
 */
export const LIST_SORT_ALIAS = 'list_sort_key';

/**
 * Empty cells go last whichever way the column is sorted.
 *
 * Postgres puts NULLs first on DESC by default, which would fill the top of a descending
 * sort with the rows that have no value — the ones the reader is least likely to be after.
 */
const NULLS = 'NULLS LAST' as const;

/**
 * SQL ordering one column, or null when the definition cannot express an order.
 *
 * A cell holding several values — the TP codes of a BTP, the processes of a mold — orders by
 * its smallest value. The row has to keep exactly one sort key: joining the related rows
 * would multiply the row into as many as it has values and break the list count and paging,
 * so the value is read back through a correlated subquery instead.
 */
function sortSql(
  alias: string,
  definition: ColumnFilterDefinition,
): string | null {
  const exists = definition.matchWithExists;
  if (exists) {
    const extra = exists.where ? ` AND related.${exists.where}` : '';
    // A cell reading from several sources takes the smallest across all of them; LEAST
    // skips the sources holding nothing rather than returning null for the whole cell.
    const smallest = existsSources(exists).map(
      (source) => `MIN(${existsValueSql(source)})`,
    );
    const value =
      smallest.length === 1 ? smallest[0] : `LEAST(${smallest.join(', ')})`;
    return `(SELECT ${value} FROM ${exists.table} related${existsJoinSql(
      exists.joins,
    )} WHERE related.${exists.foreignKey} = ${alias}.id${extra})`;
  }

  const ids = definition.matchWithJsonbIds;
  if (ids) {
    const extra = ids.where ? ` AND related.${ids.where}` : '';
    return `(SELECT MIN(related.${ids.valueColumn}) FROM ${ids.table} related WHERE related.id IN (${jsonbIdSelect(
      alias,
      ids,
    )})${extra})`;
  }

  if (definition.expression) return definition.expression;
  if (definition.field) return columnSql(alias, definition);
  return null;
}

/**
 * Which column a list sorts by and in which direction, without touching a query.
 *
 * An absent, unknown or unsortable `sortBy` resolves to the list's own default order rather
 * than raising: a stale bookmark or a column the reader has just hidden should open the list,
 * not fail it.
 */
export function resolveColumnSort(
  options: ColumnSortOptions,
): ResolvedColumnSort {
  const { alias, map, query, fallback, unsortable, extra } = options;
  const requested = query.sortBy;

  if (requested && !unsortable?.includes(requested)) {
    const definition = map[requested];
    const sql = definition ? sortSql(alias, definition) : extra?.[requested];
    if (sql) {
      // A stored column is addressed by its property path, which TypeORM resolves on every
      // query shape; anything composed is raw SQL and needs the select-alias detour.
      const isPlainColumn = Boolean(
        definition?.field && !definition.expression,
      );
      return {
        column: requested,
        direction: resolveSortOrder(query.sortOrder),
        sql,
        isExpression: !isPlainColumn,
      };
    }

    if (isBaseSortableField(requested)) {
      return {
        column: requested,
        direction: query.sortOrder ? resolveSortOrder(query.sortOrder) : 'DESC',
        sql: `${alias}.${requested}`,
        isExpression: false,
      };
    }
  }

  return {
    column: null,
    direction: fallback.direction,
    sql: fallback.sql,
    isExpression: false,
  };
}

/**
 * Orders a list query by the requested column, or leaves it in its own default order.
 *
 * `id` breaks ties in the same direction, the rule every list here already follows: a sort
 * key that is not unique — a name shared by two rows, a timestamp a bulk import wrote onto
 * many — lets Postgres return a row twice across two pages, or skip it entirely.
 */
export function applyColumnSort<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  options: ColumnSortOptions,
): ResolvedColumnSort {
  const sort = resolveColumnSort(options);
  const definition = sort.column ? options.map[sort.column] : undefined;

  // A relation column is ordered through its join, which the list may not have made itself.
  if (definition?.relation && !definition.expression) {
    ensureRelationJoin(qb, options.alias, definition.relation);
  }

  if (sort.isExpression) {
    qb.addSelect(sort.sql, LIST_SORT_ALIAS);
  }

  qb.orderBy(
    sort.isExpression ? LIST_SORT_ALIAS : sort.sql,
    sort.direction,
    NULLS,
  ).addOrderBy(options.tieBreak ?? `${options.alias}.id`, sort.direction);

  return sort;
}

export interface ColumnSortFindOptions {
  map: ColumnFilterMap;
  query: ColumnSortQuery;
  /** Entity property the list falls back to, and the direction it reads in. */
  fallback: { field: string; direction: 'ASC' | 'DESC' };
  unsortable?: readonly string[];
}

/**
 * The sort as TypeORM find options, for a list built with `findAndCount` rather than a
 * query builder.
 *
 * Only a stored column orders this way. A composed expression, or a value matched through a
 * related table, has no find-options form — a list whose table shows one of those builds its
 * query with a builder and calls {@link applyColumnSort} instead.
 */
function plainOrder<T extends object>(
  field: string,
  direction: 'ASC' | 'DESC',
): FindOptionsOrder<T> {
  const order: Record<string, 'ASC' | 'DESC'> = {
    [field]: direction,
    id: direction,
  };
  return order as FindOptionsOrder<T>;
}

export function toColumnSortOrder<T extends object>(
  options: ColumnSortFindOptions,
): FindOptionsOrder<T> {
  const { map, query, fallback, unsortable } = options;
  const requested = query.sortBy;

  if (requested && !unsortable?.includes(requested)) {
    const definition = map[requested];
    if (definition?.field && !definition.expression) {
      const direction = resolveSortOrder(query.sortOrder);
      // Empty cells go last either way, as they do on the query-builder path.
      const value = { direction, nulls: 'last' } as const;
      const order: Record<string, unknown> = definition.relation
        ? { [definition.relation]: { [definition.field]: value } }
        : { [definition.field]: value };
      order.id = direction;
      return order as FindOptionsOrder<T>;
    }

    if (isBaseSortableField(requested)) {
      const direction = query.sortOrder
        ? resolveSortOrder(query.sortOrder)
        : 'DESC';
      return plainOrder<T>(requested, direction);
    }
  }

  return plainOrder<T>(fallback.field, fallback.direction);
}
