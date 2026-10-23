import {
  existsJoinSql,
  existsSourcesMatchSql,
  type ColumnFilterMap,
  type ColumnFilterSelections,
  type ExistsMatch,
} from '@shared/utils/column-filter.util';

import type { EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * Alias of the one line a line-scoped condition is written against. Search and quick-filter
 * SQL handed to {@link buildLineScopedMatch} reads line columns through it, e.g.
 * `${LINE_SCOPE_ALIAS}.material_code ILIKE :search`.
 */
export const LINE_SCOPE_ALIAS = 'scoped_line';

/** The line table a document list draws one row per, and how a line points at its document. */
export interface LineScope {
  /** Document (header) table, joined under the list alias so conditions may read it. */
  headerTable: string;
  /** Line table, e.g. `raw_material_receipt_ok_lines`. */
  table: string;
  /** Column of the line table pointing back at the document. */
  foreignKey: string;
  /** Condition every live line satisfies, unprefixed, e.g. `is_deleted = false`. */
  where: string;
}

/** Extra SQL one line has to satisfy, written against {@link LINE_SCOPE_ALIAS} and the list alias. */
export interface LineCondition {
  sql: string;
  params?: Record<string, unknown>;
}

/**
 * The line-level part of a document list's search and filters, kept as one set of conditions
 * a single line has to meet together.
 *
 * Such a list pages documents but draws one row per line. Its line filters select a document
 * through an `EXISTS` over the lines — which qualifies the document, but neither says which of
 * its lines to draw nor makes two filters hold on the same line. Matching both the document
 * and the lines drawn against this one set fixes both: filtering on material X returns the
 * lines of material X, not every line of every document holding one.
 */
export interface LineScopedMatch {
  /** False when no line-level condition is active: every live line is drawn. */
  active: boolean;
  /** Keeps the documents holding at least one line that meets every condition. */
  applyToDocuments<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    listAlias: string,
  ): void;
  /**
   * Narrows a line query already reading `scope.table` under `lineAlias` — the list's line
   * count, for one. The list alias must be joined in that query too when a condition reads it.
   */
  applyToLines<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    lineAlias: string,
  ): void;
  /** Ids of the lines of these documents meeting every condition; undefined when inactive. */
  findLineIds(
    manager: EntityManager,
    listAlias: string,
    documentIds: Array<number | string>,
  ): Promise<Set<number> | undefined>;
}

const ID_CHUNK = 5000;

function paramName(key: string): string {
  return `lineScope_${key.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

/**
 * Line-level column filters of the map, as conditions on {@link LINE_SCOPE_ALIAS}. Only the
 * definitions matching through `scope.table` count: a header column selects documents, and a
 * document it selects keeps every line.
 */
function lineFilterConditions(
  scope: LineScope,
  map: ColumnFilterMap,
  selections?: ColumnFilterSelections,
): LineCondition[] {
  const conditions: LineCondition[] = [];
  for (const [key, values] of Object.entries(selections ?? {})) {
    const exists = map[key]?.matchWithExists;
    if (
      !exists ||
      exists.table !== scope.table ||
      exists.foreignKey !== scope.foreignKey ||
      !Array.isArray(values) ||
      values.length === 0
    ) {
      continue;
    }
    const name = paramName(key);
    const ors = existsSourcesMatchSql(exists, name, values);
    // The definition's SQL reads the line as `related`; correlating it to the scoped line
    // reuses it verbatim, joins included, so the line drawn is the line the filter offered.
    conditions.push({
      sql: `EXISTS (
        SELECT 1 FROM ${exists.table} related${existsJoinSql(exists.joins)}
        WHERE related.id = ${LINE_SCOPE_ALIAS}.id AND (${ors})
      )`,
      params: { [name]: values.map((value) => value ?? '') },
    });
  }
  return conditions;
}

/**
 * Builds the line-scoped match of one list request: its line-level column filters plus the
 * search and quick filters the caller writes against {@link LINE_SCOPE_ALIAS}.
 */
export function buildLineScopedMatch(
  scope: LineScope,
  map: ColumnFilterMap,
  selections: ColumnFilterSelections | undefined,
  extra: Array<LineCondition | undefined> = [],
): LineScopedMatch {
  const conditions = [
    ...lineFilterConditions(scope, map, selections),
    ...extra.filter((condition): condition is LineCondition =>
      Boolean(condition),
    ),
  ];
  const params = Object.assign(
    {},
    ...conditions.map((condition) => condition.params ?? {}),
  ) as Record<string, unknown>;
  const where = conditions
    .map((condition) => `(${condition.sql})`)
    .join(' AND ');
  const live = `${LINE_SCOPE_ALIAS}.${scope.where}`;
  const active = conditions.length > 0;

  return {
    active,
    applyToDocuments(qb, listAlias) {
      if (!active) return;
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM ${scope.table} ${LINE_SCOPE_ALIAS}
          WHERE ${LINE_SCOPE_ALIAS}.${scope.foreignKey} = ${listAlias}.id
            AND ${live}
            AND ${where}
        )`,
        params,
      );
    },
    applyToLines(qb, lineAlias) {
      if (!active) return;
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM ${scope.table} ${LINE_SCOPE_ALIAS}
          WHERE ${LINE_SCOPE_ALIAS}.id = ${lineAlias}.id AND ${where}
        )`,
        params,
      );
    },
    async findLineIds(manager, listAlias, documentIds) {
      if (!active) return undefined;
      const ids = new Set<number>();
      // Chunked: an unpaged export can name tens of thousands of documents, past what one
      // `IN` list may bind.
      for (let start = 0; start < documentIds.length; start += ID_CHUNK) {
        const rows = await manager
          .createQueryBuilder()
          .select(`${LINE_SCOPE_ALIAS}.id`, 'id')
          .from(scope.table, LINE_SCOPE_ALIAS)
          .innerJoin(
            scope.headerTable,
            listAlias,
            `${listAlias}.id = ${LINE_SCOPE_ALIAS}.${scope.foreignKey}`,
          )
          .where(
            `${LINE_SCOPE_ALIAS}.${scope.foreignKey} IN (:...lineScopeDocumentIds)`,
            {
              lineScopeDocumentIds: documentIds.slice(start, start + ID_CHUNK),
            },
          )
          .andWhere(live)
          .andWhere(where, params)
          .getRawMany<{ id: number | string }>();
        for (const row of rows) ids.add(Number(row.id));
      }
      return ids;
    },
  };
}

/** Keeps the lines `ids` names on each document; an inactive match keeps them all. */
export function narrowDocumentLines<
  D extends { lines: L[] },
  L extends { id: number },
>(documents: D[], ids: Set<number> | undefined): D[] {
  if (!ids) return documents;
  return documents.map((document) => ({
    ...document,
    lines: document.lines.filter((line) => ids.has(Number(line.id))),
  }));
}

/**
 * The `applyRelatedScope` of a list drawing one row per line: a column read from its lines
 * offers only the values of the lines the list draws — the ones meeting `match` — not every
 * line of the documents it shows. Build `match` from the column-values request with the
 * other columns' selections, so the values narrow the way the rows on screen do.
 */
export function lineScopedRelatedScope(
  scope: LineScope,
  match: LineScopedMatch,
) {
  return <T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    relatedAlias: string,
    exists: ExistsMatch,
  ): void => {
    if (
      exists.table === scope.table &&
      exists.foreignKey === scope.foreignKey
    ) {
      match.applyToLines(qb, relatedAlias);
    }
  };
}
