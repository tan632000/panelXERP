import type { EntityManager } from 'typeorm';

/**
 * The document a referencing row belongs to: `column` on the child row holds this table's
 * id. Needed where deleting the document leaves its rows un-flagged, so a row only counts
 * while every document above it is live too.
 */
export interface ReferenceParent {
  table: string;
  column: string;
  /** False for a table with no `is_deleted` of its own; its liveness comes from above. */
  softDeletable?: boolean;
  parent?: ReferenceParent;
}

/** One table that points at a master-data row, and the column that carries its id or code. */
export interface ReferenceSource {
  table: string;
  column: string;
  /** False for a table with no `is_deleted` of its own; its liveness comes from `parent`. */
  softDeletable?: boolean;
  parent?: ReferenceParent;
  /**
   * Set when `column` is a jsonb array of objects rather than a scalar: the row counts when
   * one element carries the value under this key.
   */
  jsonArrayKey?: string;
}

const UNDEFINED_TABLE = '42P01';
const UNDEFINED_COLUMN = '42703';

/**
 * Counts non-deleted rows across every referencing table.
 *
 * A table or column that does not exist in this environment is skipped rather than
 * failing the whole delete: modules ship incrementally, and a missing table means "no
 * reference can exist yet", not "the check is broken".
 */
export async function countActiveReferences(
  manager: EntityManager,
  sources: readonly ReferenceSource[],
  value: number | string,
): Promise<number> {
  let total = 0;

  for (const source of sources) {
    try {
      const raw: unknown = await manager.query(
        buildCountSql(source, typeof value === 'string'),
        [value],
      );
      total += readCount(raw);
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === UNDEFINED_TABLE || code === UNDEFINED_COLUMN) continue;
      throw error;
    }
  }

  return total;
}

/** True as soon as one referencing row is found, without counting the rest. */
export async function hasActiveReference(
  manager: EntityManager,
  sources: readonly ReferenceSource[],
  value: number | string,
): Promise<boolean> {
  for (const source of sources) {
    if ((await countActiveReferences(manager, [source], value)) > 0) {
      return true;
    }
  }
  return false;
}

/**
 * A code is matched case-insensitively: codes are unique regardless of case, and a code once
 * re-cased on its master still names the same item on the lines filed under the old casing.
 */
function buildCountSql(source: ReferenceSource, isCode: boolean): string {
  let match = `source.${source.column} = $1`;
  if (source.jsonArrayKey) {
    match = `source.${source.column} @> jsonb_build_array(jsonb_build_object('${source.jsonArrayKey}', $1::text))`;
  } else if (isCode) {
    match = `LOWER(source.${source.column}) = LOWER($1)`;
  }
  const conditions = [match];
  if (source.softDeletable !== false) {
    conditions.push('source.is_deleted = false');
  }

  const joins: string[] = [];
  let childAlias = 'source';
  let parent = source.parent;
  for (let depth = 1; parent; depth += 1, parent = parent.parent) {
    const alias = `parent${depth}`;
    const live =
      parent.softDeletable === false ? '' : ` AND ${alias}.is_deleted = false`;
    joins.push(
      `JOIN ${parent.table} ${alias} ON ${alias}.id = ${childAlias}.${parent.column}${live}`,
    );
    childAlias = alias;
  }

  return `SELECT COUNT(*)::int AS count FROM ${source.table} source ${joins.join(' ')}
         WHERE ${conditions.join(' AND ')}`;
}

function readCount(raw: unknown): number {
  const rows: unknown[] = Array.isArray(raw) ? raw : [];
  const first: unknown = rows[0];
  if (
    typeof first === 'object' &&
    first !== null &&
    'count' in first &&
    typeof first.count === 'number'
  ) {
    return (first as { count: number }).count;
  }
  return 0;
}
