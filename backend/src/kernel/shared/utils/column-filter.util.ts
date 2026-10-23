import { BadRequestException } from '@nestjs/common';
import { And, Raw } from 'typeorm';

import { DEFAULT_PICKER_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate, type PaginatedResult } from '@shared/dto/pagination.dto';
import { resolvePagination } from '@shared/utils/pagination.util';
import { escapeLikePattern } from '@shared/utils/typeorm-search.util';

import type {
  EntityTarget,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

/**
 * One column a list can filter and enumerate values for.
 *
 * Values travel as the stored text, which the client labels for display, so a column of
 * any shape can appear here as long as one of the fields below can express it in SQL.
 */
export interface ColumnFilterDefinition {
  /** Entity property holding the value, unless one of the fields below supplies the SQL. */
  field?: string;
  /** Relation property to join when the value lives on a related entity. */
  relation?: string;
  /**
   * SQL for a column the list composes rather than stores — a fallback between two
   * columns, a `code — name` label, a flag derived from a file key. Written against the
   * list alias and the relations its base query joins, and used for both filtering and
   * value listing so a filter offers exactly the text the cell shows.
   *
   * Write every identifier quoted and in its database spelling — `"variant"."fg_code"` —
   * because the query builder only rewrites property names it recognizes, and Postgres
   * folds an unquoted camelCase alias to lower case.
   */
  expression?: string;
  /**
   * Extra SQL the value search also matches, for a cell showing more than the value it
   * filters on — a company code above its name. A user types the name they read and still
   * finds the code it belongs to. Written like `expression`, against the list alias.
   */
  searchAlso?: string[];
  /**
   * Set for a value held by a one-to-many relation, e.g. every TP code of a BTP. The rows
   * are matched with `EXISTS` rather than a join, because a join would multiply them and
   * break the list count and its paging.
   *
   * One source (`column`) covers a cell reading a single stored column. Cells composing
   * several stored fields declare every one of them instead:
   * - `sources` lists each place a value is read from; a row matches when ANY source
   *   holds a selected value, and the values list unions every source. A dual-unit
   *   quantity cell showing both kg and pcs lists both numbers this way.
   * - `joins` reads through an extra table, e.g. receipt lines to their supplier's
   *   company row or to the material catalogue behind a material code.
   * - `valueExpression` computes the value in SQL, e.g. remaining-stock arithmetic
   *   over the matched row's own columns.
   */
  matchWithExists?: {
    table: string;
    /** Column of that table pointing back at the list row. */
    foreignKey: string;
    /** Extra condition the related rows satisfy, e.g. `is_deleted = false`. */
    where?: string;
    /** Extra joins usable by the value sources, written against `related`. */
    joins?: ColumnFilterExistsJoin[];
    /** Single column of that table holding the value; `sources: [{ column }]` alike. */
    column?: string;
    /** Any-match across sources; the values list unions them. */
    sources?: ColumnFilterValueSource[];
  };
  /**
   * Set for a value the row references through a jsonb list of ids — the processes and
   * products of a mold, the molds of a product. One cell holds several of them, so a
   * selected value matches every row whose list contains it.
   */
  matchWithJsonbIds?: {
    column: string;
    /** Key inside each element, when the elements are objects rather than bare ids. */
    elementKey?: string;
    table: string;
    /** Column of that table holding the text the cell shows. */
    valueColumn: string;
    /** Extra condition the referenced rows satisfy, e.g. `is_deleted = false`. */
    where?: string;
  };
}

/**
 * One extra table a line-level column-filter value is read through, e.g. receipt lines
 * to their supplier's company row, or to the material catalogue behind a material code.
 * The join runs inside the `EXISTS` match and the values query alike, so filtering and
 * value listing see the same rows.
 */
export interface ColumnFilterExistsJoin {
  table: string;
  alias: string;
  /** Join condition written against the `related` alias and this join's alias. */
  on: string;
  /** Extra condition on the joined alias, e.g. `is_deleted = false`. */
  where?: string;
}

/**
 * One place a line-level column-filter value is read from. Used for both filtering and
 * value listing so a filter offers exactly the text the cell shows.
 */
export type ColumnFilterValueSource =
  /** A column of the matched table (`related` alias). */
  | { column: string }
  /** A column of one of `joins`, e.g. the supplier name behind a stored supplier id. */
  | { from: { alias: string; column: string } }
  /** Raw SQL computing the value, e.g. remaining-stock arithmetic over `related` columns. */
  | { expression: string };

/** SQL reading the id out of an element of a jsonb list, whether of objects or of bare ids. */
function jsonbElementSql(
  element: string,
  ids: NonNullable<ColumnFilterDefinition['matchWithJsonbIds']>,
): string {
  return ids.elementKey
    ? `${element} ->> '${ids.elementKey}'`
    : `${element} #>> '{}'`;
}

/** SQL selecting the ids out of a jsonb list, whether of objects or of bare ids. */
export function jsonbIdSelect(
  alias: string,
  ids: NonNullable<ColumnFilterDefinition['matchWithJsonbIds']>,
): string {
  return `SELECT (${jsonbElementSql('element', ids)})::int FROM jsonb_array_elements(${alias}.${ids.column}) element`;
}

/** The ids of a jsonb list as a set-returning expression, one id per element of the row. */
function jsonbIdElementSql(
  alias: string,
  ids: NonNullable<ColumnFilterDefinition['matchWithJsonbIds']>,
): string {
  return jsonbElementSql(`jsonb_array_elements(${alias}.${ids.column})`, ids);
}

/** Filterable columns of one list, keyed by the column key the API exposes. */
export type ColumnFilterMap = Record<string, ColumnFilterDefinition>;

/** Selected values per column key, as the client sends them. */
export type ColumnFilterSelections = Record<string, string[]>;

/** The filterable column keys of a list, for the API docs of its column-values endpoint. */
export function columnFilterKeys(map: ColumnFilterMap): string[] {
  return Object.keys(map);
}

/** Empty text stands for rows with no value in that column. */
const BLANK_VALUE = '';

function asTextExpression(alias: string): string {
  return `COALESCE(CAST(${alias} AS TEXT), '')`;
}

/** SQL the definition reads, be it a column of the list, of a relation, or composed. */
export function columnSql(
  alias: string,
  definition: ColumnFilterDefinition,
): string {
  if (definition.expression) return definition.expression;
  return `${definition.relation ?? alias}.${definition.field}`;
}

/**
 * The selected values merged into a list's `findAndCount` where clause.
 *
 * Values are compared as text against `COALESCE(column, '')`, so an unset column is
 * selectable through the blank entry the value list offers. The clause may already be a
 * set of OR branches built by the keyword search, in which case every branch is narrowed,
 * and a column carrying both a search and a filter condition keeps both.
 */
export function mergeColumnFilterConditions<W extends Record<string, unknown>>(
  where: W | W[],
  map: ColumnFilterMap,
  selections?: ColumnFilterSelections,
): W | W[] {
  if (!selections || Object.keys(selections).length === 0) return where;

  if (Array.isArray(where)) {
    return where.map(
      (branch) => mergeColumnFilterConditions(branch, map, selections) as W,
    );
  }

  const conditions: Record<string, unknown> = { ...where };

  for (const [key, values] of Object.entries(selections)) {
    const definition = map[key];
    // A find-options clause addresses a property; the SQL-bearing kinds need a query builder.
    if (!definition?.field || !Array.isArray(values) || values.length === 0) {
      continue;
    }

    const field = definition.field;
    const condition = Raw(
      (alias) => `${asTextExpression(alias)} IN (:...${paramName(key)})`,
      { [paramName(key)]: values.map((value) => value ?? BLANK_VALUE) },
    );

    const target = definition.relation
      ? {
          ...((conditions[definition.relation] ?? {}) as Record<
            string,
            unknown
          >),
        }
      : conditions;

    target[field] = combine(target[field], condition);

    if (definition.relation) {
      conditions[definition.relation] = target;
    }
  }

  return conditions as W;
}

function combine(existing: unknown, condition: unknown): unknown {
  if (existing === undefined) return condition;
  // Keeps a keyword-search condition on the same column instead of replacing it.
  return And(
    existing as Parameters<typeof And>[0],
    condition as Parameters<typeof And>[0],
  );
}
/** Extra joins of an EXISTS match, shared by filtering and value listing. */
export function existsJoinSql(
  joins: ColumnFilterExistsJoin[] | undefined,
): string {
  return (joins ?? [])
    .map(
      (join) =>
        ` LEFT JOIN ${join.table} ${join.alias} ON ${join.on}${
          join.where ? ` AND ${join.alias}.${join.where}` : ''
        }`,
    )
    .join('');
}

export type ExistsMatch = NonNullable<
  ColumnFilterDefinition['matchWithExists']
>;

/** Every place an EXISTS match reads its value from; legacy `column` means one source. */
export function existsSources(exists: ExistsMatch): ColumnFilterValueSource[] {
  if (exists.sources?.length) return exists.sources;
  if (!exists.column) {
    throw new Error(
      'Column filter misconfigured: matchWithExists needs column or sources.',
    );
  }
  return [{ column: exists.column }];
}

/** SQL reading one value source, for both the IN match and the values list. */
export function existsValueSql(source: ColumnFilterValueSource): string {
  if ('expression' in source) return source.expression;
  if ('from' in source) return `${source.from.alias}.${source.from.column}`;
  return `related.${source.column}`;
}

/**
 * SQL matching the selected values against every source of an EXISTS definition, written
 * against `related` and the definition's joins.
 *
 * A row matches when ANY source holds a selected non-blank value. The blank entry is
 * different: a multi-source cell shows a dash only when EVERY source is empty — a reference
 * cell falls back from the MRP number to the free reference — so blank selects the rows
 * whose sources are all empty, not every row with one empty source.
 */
export function existsSourcesMatchSql(
  exists: ExistsMatch,
  param: string,
  values: string[],
): string {
  const texts = existsSources(exists).map((source) =>
    asTextExpression(existsValueSql(source)),
  );
  if (texts.length === 1) return `${texts[0]} IN (:...${param})`;
  const branches = texts.map(
    (text) => `(${text} IN (:...${param}) AND ${text} <> '')`,
  );
  if (values.some((value) => (value ?? BLANK_VALUE) === BLANK_VALUE)) {
    branches.push(`(${texts.map((text) => `${text} = ''`).join(' AND ')})`);
  }
  return branches.join(' OR ');
}

/** Query-builder lists take the same selections as `AND column IN (...)` clauses. */
export function applyColumnFilterQuery<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  map: ColumnFilterMap,
  selections?: ColumnFilterSelections,
): void {
  if (!selections) return;

  for (const [key, values] of Object.entries(selections)) {
    const definition = map[key];
    if (!definition || !Array.isArray(values) || values.length === 0) continue;

    const parameters = {
      [paramName(key)]: values.map((value) => value ?? BLANK_VALUE),
    };

    const exists = definition.matchWithExists;
    if (exists) {
      const extra = exists.where ? ` AND related.${exists.where}` : '';
      const ors = existsSourcesMatchSql(exists, paramName(key), values);
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM ${exists.table} related${existsJoinSql(exists.joins)}
          WHERE related.${exists.foreignKey} = ${alias}.id${extra}
            AND (${ors})
        )`,
        parameters,
      );
      continue;
    }
    const ids = definition.matchWithJsonbIds;
    if (ids) {
      const extra = ids.where ? ` AND related.${ids.where}` : '';
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM ${ids.table} related
          WHERE related.id IN (${jsonbIdSelect(alias, ids)})${extra}
            AND ${asTextExpression(`related.${ids.valueColumn}`)} IN (:...${paramName(key)})
        )`,
        parameters,
      );
      continue;
    }

    if (definition.relation && !definition.expression) {
      ensureRelationJoin(qb, alias, definition.relation);
    }

    qb.andWhere(
      `${asTextExpression(columnSql(alias, definition))} IN (:...${paramName(key)})`,
      parameters,
    );
  }
}

/** Joins a relation once: the caller may already have joined it for its own conditions. */
export function ensureRelationJoin<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  relation: string,
): void {
  const alreadyJoined = qb.expressionMap.joinAttributes.some(
    (join) => join.alias.name === relation,
  );
  if (!alreadyJoined) {
    qb.leftJoin(`${alias}.${relation}`, relation);
  }
}

function paramName(key: string): string {
  return `columnFilter_${key.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

export interface ColumnValuesQuery {
  column: string;
  search?: string;
  page?: number;
  limit?: number;
  /**
   * The selections the reader holds on the list's other columns. The values offered are
   * those of the rows the list currently shows, the way an Excel filter narrows step by step;
   * the column's own selection is ignored so its unselected values stay pickable.
   */
  columnFilters?: ColumnFilterSelections;
  /** The list's own keyword search, which a list applies in its base conditions. */
  listSearch?: string;
}

/** The reader's selections minus one column — what that column's value list is scoped by. */
export function otherColumnFilters(
  selections: ColumnFilterSelections | undefined,
  column: string,
): ColumnFilterSelections | undefined {
  if (!selections) return undefined;
  const rest = Object.fromEntries(
    Object.entries(selections).filter(([key]) => key !== column),
  );
  return Object.keys(rest).length > 0 ? rest : undefined;
}

export interface ColumnValuesOptions<T extends ObjectLiteral> {
  /** Alias the base conditions are written against. */
  alias: string;
  map: ColumnFilterMap;
  /** Conditions every listed row satisfies — the soft-delete flag, tenant scope, … */
  applyBaseWhere?: (qb: SelectQueryBuilder<T>, alias: string) => void;
  /**
   * Narrows the related rows a one-to-many column reads its values from, joined as
   * `relatedAlias`. A list drawing one row per line passes its line match here, so a line
   * column offers the values of the lines on screen rather than of every line of the
   * documents on screen.
   */
  applyRelatedScope?: (
    qb: SelectQueryBuilder<T>,
    relatedAlias: string,
    exists: ExistsMatch,
  ) => void;
}

/**
 * The list query a column-values request stands for: its toolbar filters as sent, the
 * list keyword back under `search`, and no column selections — `findColumnValues` applies
 * those itself, minus the column being listed. Feed it to the list's own where builder.
 */
export function toListScopeQuery<Q extends ColumnValuesQuery>(
  query: Q,
): Omit<Q, keyof ColumnValuesQuery> & { search?: string } {
  const {
    column: _column,
    search: _valueSearch,
    page: _page,
    limit: _limit,
    columnFilters: _columnFilters,
    listSearch,
    ...scope
  } = query;
  return { ...scope, search: listSearch };
}

/**
 * Narrows a column-values query to the rows a list's find-options `where` keeps — its
 * keyword search, toolbar filters and tab — so the column filter offers the values of the
 * rows on screen rather than of the whole table.
 *
 * The clause is the list's own, applied through an id subquery, so the two can never drift
 * apart. Leave the column selections out of it: `findColumnValues` applies them itself,
 * minus the column being listed.
 */
export function applyListWhere<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  entity: EntityTarget<T>,
  where: FindOptionsWhere<T> | Array<FindOptionsWhere<T>>,
): void {
  const rows = qb
    .subQuery()
    .from(entity, `${alias}_list`)
    .setFindOptions({ where })
    .select(`${alias}_list.id`);
  qb.andWhere(`${alias}.id IN ${rows.getQuery()}`, rows.getParameters());
}

/**
 * The distinct values of one filterable column, paginated and searchable.
 *
 * The list screen filters against the whole table, so its value list has to come from the
 * database rather than the page the client happens to hold.
 */
export async function findColumnValues<T extends ObjectLiteral>(
  repo: Repository<T>,
  query: ColumnValuesQuery,
  options: ColumnValuesOptions<T>,
): Promise<PaginatedResult<string>> {
  const definition = options.map[query.column];
  if (!definition) {
    throw new UnknownColumnFilterError(query.column, Object.keys(options.map));
  }

  const { page, limit, skip, take } = resolvePagination(
    query,
    DEFAULT_PICKER_PAGE_SIZE,
  );

  const valueColumns: string[] = (() => {
    if (definition.matchWithExists) {
      return existsSources(definition.matchWithExists).map(existsValueSql);
    }
    if (definition.matchWithJsonbIds) {
      return [`related.${definition.matchWithJsonbIds.valueColumn}`];
    }
    return [columnSql(options.alias, definition)];
  })();

  const scopedRows = (): SelectQueryBuilder<T> => {
    const qb = repo.createQueryBuilder(options.alias);
    // Base conditions often start with `qb.where`, so the reader's filters come after them.
    options.applyBaseWhere?.(qb, options.alias);
    applyColumnFilterQuery(
      qb,
      options.alias,
      options.map,
      otherColumnFilters(query.columnFilters, query.column),
    );
    return qb;
  };

  const withValue = (
    qb: SelectQueryBuilder<T>,
    valueColumn: string,
  ): SelectQueryBuilder<T> => {
    const keyword = query.search?.trim();
    if (keyword) {
      const searched = [valueColumn, ...(definition.searchAlso ?? [])]
        .map(
          (column) =>
            `erp_unaccent(CAST(${column} AS TEXT)) ILIKE erp_unaccent(:columnValueSearch)`,
        )
        .join(' OR ');
      qb.andWhere(`(${searched})`, {
        columnValueSearch: `%${escapeLikePattern(keyword)}%`,
      });
    }
    return qb.select(asTextExpression(valueColumn), 'value');
  };

  const build = (valueColumn: string): SelectQueryBuilder<T> => {
    const exists = definition.matchWithExists;
    const ids = definition.matchWithJsonbIds;
    if (ids) {
      // The ids of the scoped rows are unnested once and the catalogue is matched against
      // that set. Joining the catalogue on `related.id IN (<ids of the row>)` instead is
      // evaluated per row x catalogue row, which takes seconds on a few hundred rows.
      const scope = scopedRows().select(
        `(${jsonbIdElementSql(options.alias, ids)})::int`,
      );
      const related = repo.manager
        .createQueryBuilder()
        .from<T>(ids.table, 'related')
        .where(`related.id IN (${scope.getQuery()})`, scope.getParameters());
      if (ids.where) related.andWhere(`related.${ids.where}`);
      return withValue(related, valueColumn);
    }
    const qb = scopedRows();
    if (exists) {
      qb.leftJoin(
        exists.table,
        'related',
        `related.${exists.foreignKey} = ${options.alias}.id${
          exists.where ? ` AND related.${exists.where}` : ''
        }`,
      );
      for (const join of exists.joins ?? []) {
        qb.leftJoin(
          join.table,
          join.alias,
          `${join.on}${join.where ? ` AND ${join.alias}.${join.where}` : ''}`,
        );
      }
      options.applyRelatedScope?.(qb, 'related', exists);
    } else if (definition.relation && !definition.expression) {
      ensureRelationJoin(qb, options.alias, definition.relation);
    }
    return withValue(qb, valueColumn);
  };

  // Multi-source cells (a reference joining two lot numbers, a dual-unit quantity showing
  // both kg and pcs) union every source in memory: each source stays small — one text
  // column of live rows — and the merged list keeps the newest-first order of the
  // single-source query.
  if (valueColumns.length > 1) {
    const seen = new Map<string, null>();
    for (const valueColumn of valueColumns) {
      const rows = await build(valueColumn)
        .distinct(true)
        .getRawMany<{ value: string }>();
      for (const row of rows) {
        const value = row.value ?? BLANK_VALUE;
        // One empty source is no blank cell while another source fills it; see below.
        if (value !== BLANK_VALUE && !seen.has(value)) seen.set(value, null);
      }
    }
    // The blank entry stands for a cell showing a dash: every source empty at once, the same
    // rule `existsSourcesMatchSql` filters by. A keyword never matches it, as with one source.
    if (!query.search?.trim()) {
      const allBlank = valueColumns
        .map((valueColumn) => `${asTextExpression(valueColumn)} = ''`)
        .join(' AND ');
      const blankRow = await build(valueColumns[0])
        .andWhere(`(${allBlank})`)
        .limit(1)
        .getRawOne<{ value: string }>();
      if (blankRow) seen.set(BLANK_VALUE, null);
    }
    const merged = [...seen.keys()].sort((a, b) => {
      if (a === b) return 0;
      return a < b ? 1 : -1;
    });
    return paginate(
      merged.slice(skip, skip + take),
      merged.length,
      page,
      limit,
    );
  }

  const valueColumn = valueColumns[0];

  // Newest-first is what every master-data list shows, so its filter values match: the
  // highest value comes first, the way the list itself opens.
  const [rows, countRow] = await Promise.all([
    build(valueColumn)
      .distinct(true)
      .orderBy('value', 'DESC')
      .offset(skip)
      .limit(take)
      .getRawMany<{ value: string }>(),
    build(valueColumn)
      .select(`COUNT(DISTINCT ${asTextExpression(valueColumn)})`, 'count')
      .getRawOne<{ count: string }>(),
  ]);

  const total = Number(countRow?.count ?? 0);

  return paginate(
    rows.map((row) => row.value ?? BLANK_VALUE),
    total,
    page,
    limit,
  );
}

/** A client asking for a column the list does not expose gets a 400, not a 500. */
export class UnknownColumnFilterError extends BadRequestException {
  constructor(column: string, allowed: string[]) {
    super(
      `Column "${column}" is not filterable. Allowed columns: ${allowed.join(', ')}.`,
    );
  }
}
