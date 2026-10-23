import {
  existsJoinSql,
  existsSources,
  existsValueSql,
  type ColumnFilterMap,
} from '@shared/utils/column-filter.util';
import {
  resolveColumnSort,
  type ColumnSortQuery,
  type DefaultListOrder,
} from '@shared/utils/column-sort.util';

import type {
  LineScope,
  LineScopedMatch,
} from '@shared/utils/line-scoped-filter.util';
import type { DataSource, ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/** Alias of the line a page row stands for. */
const PAGED_LINE = 'paged_line';

/** Output name the per-line sort value is selected under, to be ordered by. */
const LINE_SORT_KEY = 'line_sort_key';

export interface LinePageOptions<T extends ObjectLiteral> {
  /**
   * The document query with every filter applied. Its own order and selection are replaced:
   * the page is ordered by line, not by document.
   */
  documents: SelectQueryBuilder<T>;
  listAlias: string;
  scope: LineScope;
  /** The request's line-level conditions; only the lines meeting them are listed. */
  match: LineScopedMatch;
  map: ColumnFilterMap;
  query: ColumnSortQuery;
  /** The document order the list opens in, as `applyColumnSort` takes it. */
  fallback: DefaultListOrder;
  /** Line column ordering one document's lines, e.g. `line_index`. */
  lineOrder: string;
  unsortable?: readonly string[];
  /**
   * Raw SQL on the list alias breaking ties between documents before their id — the
   * `tieBreak` the list's own `applyColumnSort` took, e.g. the document number, so documents
   * of one date keep the order they always had.
   */
  tieBreak?: string;
  /** Documents to skip and take — omitted for the unpaged read an export makes. */
  skip?: number;
  take?: number;
  /** Rows of another source paged and ordered together with the document lines. */
  union?: LinePageUnion;
}

/**
 * Rows a list draws beside its document lines — they have no document of their own, so each
 * names its own `source`. They join the page through a SQL `UNION ALL`, which keeps paging and
 * the totals exact. The row SQL reads `:named` parameters, prefixed so they cannot collide with
 * the document query's.
 */
export interface LinePageUnion {
  /**
   * Selects one row per extra line with the columns, in this order, `"lineId"`,
   * `"documentId"`, `line_sort_key` (the same type as the document lines' sort key),
   * `"source"` and `line_ord`.
   */
  rowsSql: string;
  /** Selects `lines` and `documents`, counting the same extra rows. */
  countSql: string;
  params: Record<string, unknown>;
}

/** One listed line and the document it belongs to, in page order. */
export interface LinePageRow {
  lineId: number;
  documentId: number;
  /** Set on a row of the page's {@link LinePageUnion}; null on a document line. */
  source: string | null;
}

export interface LinePage {
  rows: LinePageRow[];
  /** Lines matching the request across every page. */
  totalLines: number;
  /** Documents those lines belong to — what the list pages over. */
  totalDocuments: number;
}

/**
 * Raw SQL of a property path on the list alias, e.g. `receipt.receiptNo` → `receipt.receipt_no`.
 * The page is read with `getRawMany`, which does not translate property names in ORDER BY.
 */
function rawColumnSql<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  listAlias: string,
  path: string,
): string {
  const [alias, property] = path.split('.');
  if (alias !== listAlias || !property) return path;
  const column =
    qb.expressionMap.mainAlias?.metadata.findColumnWithPropertyPath(property);
  return column ? `${listAlias}.${column.databaseName}` : path;
}

/**
 * SQL of the value one listed line sorts by. A line column reads the line's own value, so the
 * list orders lines rather than documents; a document column reads the document's.
 */
function lineSortSql<T extends ObjectLiteral>(
  options: LinePageOptions<T>,
): { sql: string; direction: 'ASC' | 'DESC' } {
  const { documents, listAlias, scope, map, query, fallback, unsortable } =
    options;
  const sort = resolveColumnSort({
    alias: listAlias,
    map,
    query,
    fallback,
    unsortable,
  });
  const exists = sort.column ? map[sort.column]?.matchWithExists : undefined;
  if (
    exists &&
    exists.table === scope.table &&
    exists.foreignKey === scope.foreignKey
  ) {
    // An empty string reads as no value, so an empty cell goes last like a null one; the
    // CASE keeps the column's own type, so numbers still order as numbers. A cell reading
    // several sources sorts by the smallest; LEAST skips the empty ones.
    const values = existsSources(exists)
      .map(existsValueSql)
      .map(
        (value) =>
          `(CASE WHEN CAST(${value} AS TEXT) = '' THEN NULL ELSE ${value} END)`,
      );
    const value =
      values.length === 1 ? values[0] : `LEAST(${values.join(', ')})`;
    return {
      sql: `(SELECT ${value} FROM ${exists.table} related${existsJoinSql(
        exists.joins,
      )} WHERE related.id = ${PAGED_LINE}.id)`,
      direction: sort.direction,
    };
  }
  return {
    sql: sort.isExpression
      ? sort.sql
      : rawColumnSql(documents, listAlias, sort.sql),
    direction: sort.direction,
  };
}

/**
 * One page of the lines a document list draws, in list order.
 *
 * The list draws one row per line but pages by DOCUMENT: a page holds `take` documents with
 * every matching line of each, so no document is split across two pages and a select-all on
 * the page reaches all of its lines. The sort still reads the line's value: lines are ranked
 * by it, a document sorts at the rank of its first line, and its lines follow one another in
 * their own sorted order.
 */
export async function findLinePage<T extends ObjectLiteral>(
  options: LinePageOptions<T>,
): Promise<LinePage> {
  const { documents, listAlias, scope, match, lineOrder, skip, take } = options;

  const base = documents
    .clone()
    .orderBy()
    .offset(undefined)
    .limit(undefined)
    .skip(undefined)
    .take(undefined)
    .innerJoin(
      scope.table,
      PAGED_LINE,
      `${PAGED_LINE}.${scope.foreignKey} = ${listAlias}.id AND ${PAGED_LINE}.${scope.where}`,
    );
  match.applyToLines(base, PAGED_LINE);

  const sort = lineSortSql(options);
  const documentLines = base
    .clone()
    .select(`${PAGED_LINE}.id`, 'lineId')
    .addSelect(`${PAGED_LINE}.${scope.foreignKey}`, 'documentId')
    .addSelect(sort.sql, LINE_SORT_KEY)
    .addSelect('CAST(NULL AS TEXT)', 'source')
    .addSelect(`${PAGED_LINE}.${lineOrder}`, 'line_ord');
  const direction = sort.direction;
  const union = options.union;

  // A union row has no tie-break column of its own, so a list with one orders documents of
  // equal key by id alone, as it always did.
  const lineRows = union
    ? `(${documentLines.getQuery()} UNION ALL ${union.rowsSql})`
    : `(${documentLines
        .clone()
        .addSelect(options.tieBreak ?? `${listAlias}.id`, 'doc_tie')
        .getQuery()})`;
  const rankOrder = [
    `u.${LINE_SORT_KEY} ${direction} NULLS LAST`,
    union ? '(u."source" IS NOT NULL) ASC' : `u.doc_tie ${direction}`,
    `u."documentId" ${direction}`,
    'u.line_ord ASC',
    'u."lineId" ASC',
  ].join(', ');
  const paging =
    take === undefined
      ? ''
      : ` LIMIT ${Number(take)} OFFSET ${Number(skip ?? 0)}`;
  const params = { ...documentLines.getParameters(), ...(union?.params ?? {}) };

  const [rows, documentCounts, unionCounts] = await Promise.all([
    runNamed<{
      lineId: number | string;
      documentId: number | string;
      source: string | null;
    }>(
      base.connection,
      `WITH ranked AS (
         SELECT u."lineId", u."documentId", u."source",
                ROW_NUMBER() OVER (ORDER BY ${rankOrder}) AS rn
           FROM ${lineRows} u
       ),
       page AS (
         SELECT r."documentId", r."source", MIN(r.rn) AS first_rn
           FROM ranked r
          GROUP BY r."documentId", r."source"
          ORDER BY first_rn${paging}
       )
       SELECT r."lineId", r."documentId", r."source"
         FROM ranked r
         JOIN page p
           ON p."documentId" = r."documentId"
          AND p."source" IS NOT DISTINCT FROM r."source"
        ORDER BY p.first_rn, r.rn`,
      params,
    ),
    base
      .clone()
      .select(`COUNT(${PAGED_LINE}.id)`, 'lines')
      .addSelect(`COUNT(DISTINCT ${listAlias}.id)`, 'documents')
      .getRawOne<{ lines: string; documents: string }>(),
    union
      ? runNamed<{ lines: string; documents: string }>(
          base.connection,
          union.countSql,
          union.params,
        )
      : Promise.resolve([]),
  ]);

  return {
    rows: rows.map((row) => ({
      lineId: Number(row.lineId),
      documentId: Number(row.documentId),
      source: row.source ?? null,
    })),
    totalLines:
      Number(documentCounts?.lines ?? 0) + Number(unionCounts[0]?.lines ?? 0),
    totalDocuments:
      Number(documentCounts?.documents ?? 0) +
      Number(unionCounts[0]?.documents ?? 0),
  };
}

/** Runs SQL written with `:named` parameters the way a query builder would. */
function runNamed<R>(
  connection: DataSource,
  sql: string,
  params: Record<string, unknown>,
): Promise<R[]> {
  const [text, values] = connection.driver.escapeQueryWithParameters(
    sql,
    params,
    {},
  );
  return connection.query(text, values);
}

export interface DocumentPagedLinesOptions<T extends ObjectLiteral> {
  /** The list's line query with every filter applied; its selection and order are replaced. */
  lines: SelectQueryBuilder<T>;
  /** SQL of the line's id and of the id of the document it belongs to. */
  lineId: string;
  documentId: string;
  /** The list's line order, most significant first. */
  order: ReadonlyArray<{
    sql: string;
    direction: 'ASC' | 'DESC';
    nulls?: 'NULLS FIRST' | 'NULLS LAST';
  }>;
  /** Documents to skip and take — omitted for an unpaged read. */
  skip?: number;
  take?: number;
}

/**
 * Ids of the lines one page of a line-drawn list holds, in list order, paged by DOCUMENT the
 * way {@link findLinePage} pages: a document sorts at the rank of its first line in `order`,
 * its lines follow one another, and a page holds `take` whole documents.
 */
export async function findDocumentPagedLineIds<T extends ObjectLiteral>(
  options: DocumentPagedLinesOptions<T>,
): Promise<number[]> {
  const { lines, skip, take } = options;
  const order = options.order
    .map(({ sql, direction, nulls }) =>
      [sql, direction, nulls].filter(Boolean).join(' '),
    )
    .join(', ');
  const ranked = lines
    .clone()
    .orderBy()
    .offset(undefined)
    .limit(undefined)
    .skip(undefined)
    .take(undefined)
    .select(options.lineId, 'lineId')
    .addSelect(options.documentId, 'documentId')
    .addSelect(`ROW_NUMBER() OVER (ORDER BY ${order})`, 'rn');
  const paging =
    take === undefined
      ? ''
      : ` LIMIT ${Number(take)} OFFSET ${Number(skip ?? 0)}`;
  const rows = await runNamed<{ lineId: number | string }>(
    lines.connection,
    `WITH ranked AS (${ranked.getQuery()}),
     page AS (
       SELECT r."documentId", MIN(r.rn) AS first_rn
         FROM ranked r
        GROUP BY r."documentId"
        ORDER BY first_rn${paging}
     )
     SELECT r."lineId"
       FROM ranked r
       JOIN page p ON p."documentId" = r."documentId"
      ORDER BY p.first_rn, r.rn`,
    ranked.getParameters(),
  );
  return rows.map((row) => Number(row.lineId));
}

/**
 * The ORDER BY a line query carries, as {@link findDocumentPagedLineIds} takes it. An order
 * key naming a selected alias — the sort expression `applyColumnSort` selects — is read as the
 * expression itself, since the paged read replaces the selection.
 */
function orderOfQuery<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
): DocumentPagedLinesOptions<T>['order'] {
  const { orderBys, selects } = qb.expressionMap;
  return Object.entries(orderBys).map(([key, value]) => {
    const selected = selects.find((select) => select.aliasName === key);
    const order = typeof value === 'string' ? { order: value } : value;
    return {
      sql: selected ? selected.selection : key,
      direction: order.order,
      nulls: order.nulls,
    };
  });
}

/**
 * One page of a line-entity list query paged by DOCUMENT: the query's own filters and ORDER BY
 * decide the line order, a document sorts at the rank of its first line, and a page holds
 * `take` whole documents with every matching line of each, in list order.
 */
export async function findDocumentPage<T extends ObjectLiteral>(
  lines: SelectQueryBuilder<T>,
  options: {
    lineAlias: string;
    /** SQL of the id of the document a line belongs to, e.g. `header.id`. */
    documentId: string;
    skip?: number;
    take?: number;
  },
): Promise<{ lines: T[]; totalLines: number; totalDocuments: number }> {
  const lineId = `${options.lineAlias}.id`;
  const [ids, counts] = await Promise.all([
    findDocumentPagedLineIds({
      lines,
      lineId,
      documentId: options.documentId,
      order: orderOfQuery(lines),
      skip: options.skip,
      take: options.take,
    }),
    lines
      .clone()
      .orderBy()
      .select(`COUNT(${lineId})`, 'lines')
      .addSelect(`COUNT(DISTINCT ${options.documentId})`, 'documents')
      .getRawOne<{ lines: string; documents: string }>(),
  ]);
  const found = ids.length
    ? await lines
        .clone()
        .andWhere(`${lineId} IN (:...documentPageLineIds)`, {
          documentPageLineIds: ids,
        })
        .getMany()
    : [];
  const position = new Map(ids.map((id, index) => [id, index]));
  return {
    lines: found.sort(
      (a, b) =>
        (position.get(Number(a.id)) ?? 0) - (position.get(Number(b.id)) ?? 0),
    ),
    totalLines: Number(counts?.lines ?? 0),
    totalDocuments: Number(counts?.documents ?? 0),
  };
}

/** Distinct document ids of a page, for loading and projecting them once each. */
export function linePageDocumentIds(page: LinePage): number[] {
  return [
    ...new Set(
      page.rows.filter((row) => !row.source).map((row) => row.documentId),
    ),
  ];
}

/**
 * Lays projected documents out in page order: one entry per run of adjacent page lines of the
 * same document.
 *
 * Each entry keeps the document's full `lines`, which its document-level state — editable,
 * deletable, pending approvals, its last line — is read from, and names the lines it lists
 * in `listedLineIds`, in page order. The client draws exactly those.
 */
export function layOutLinePage<D extends { id: number }>(
  documents: D[],
  page: LinePage,
): Array<D & { listedLineIds: number[] }> {
  const byId = new Map(
    documents.map((document) => [Number(document.id), document]),
  );
  const entries: Array<D & { listedLineIds: number[] }> = [];
  for (const row of page.rows) {
    // A union row names no document of this list; the caller lays it out.
    if (row.source) continue;
    const document = byId.get(row.documentId);
    if (!document) continue;
    const last = entries[entries.length - 1];
    if (last && Number(last.id) === row.documentId) {
      last.listedLineIds.push(row.lineId);
    } else {
      entries.push({ ...document, listedLineIds: [row.lineId] });
    }
  }
  return entries;
}

/**
 * Lays projected documents out in page order with only their listed lines — the export's
 * shape, whose rows are the lines themselves and which carries no document-level state.
 */
export function narrowToLinePage<
  D extends { id: number; lines: L[] },
  L extends { id?: number },
>(documents: D[], page: LinePage): D[] {
  return layOutLinePage(documents, page).map(({ listedLineIds, ...entry }) => {
    const linesById = new Map(
      entry.lines.map((line) => [Number(line.id), line]),
    );
    return {
      ...(entry as unknown as D),
      lines: listedLineIds
        .map((id) => linesById.get(id))
        .filter((line): line is L => line !== undefined),
    };
  });
}
