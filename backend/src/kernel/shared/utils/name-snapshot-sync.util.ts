import type { EntityManager } from 'typeorm';

/**
 * One document column that keeps a copy of a master's name next to the master's code or id.
 *
 * Documents snapshot the name rather than joining the master, so a rename has to be written
 * through to them. `keyColumn` identifies the master — its code (matched case-insensitively)
 * or its id — and `nameColumn` is the copy that follows the master's current name.
 */
export interface NameSnapshotTarget {
  table: string;
  keyColumn: string;
  nameColumn: string;
  /**
   * Set when the copy lives inside a jsonb array of objects: `arrayColumn` is the table
   * column holding the array, and `keyColumn` / `nameColumn` name the fields of each element.
   */
  arrayColumn?: string;
  /**
   * An extra SQL condition on the row, for a column that only holds the master's name on
   * some rows — e.g. an RFQ line whose name was typed by hand when no variant was picked.
   */
  where?: string;
}

/**
 * Rewrites every document's copy of a master name from `oldName` to `newName`, for any status
 * — completed, approved and cancelled documents included — so the catalogue and the documents
 * read the same. Only rows still carrying `oldName` change: a name someone deliberately typed
 * differently on a document stays theirs. A rename to a blank name is not written through.
 * Run it in the transaction that saves the master, so a failed write leaves both as they were.
 */
export async function syncNameSnapshots(
  manager: EntityManager,
  targets: readonly NameSnapshotTarget[],
  key: string | number,
  oldName: string,
  newName: string,
): Promise<void> {
  // A blank master name (a TP variant may have none) would blank every document that
  // still shows the old one, where the document's own name is the better reading.
  if (oldName === newName || newName.trim() === '') return;
  for (const target of targets) {
    await manager.query(buildSyncSql(target, typeof key === 'string'), [
      key,
      oldName,
      newName,
    ]);
  }
}

function buildSyncSql(target: NameSnapshotTarget, isCode: boolean): string {
  const extra = target.where ? ` AND (${target.where})` : '';

  if (target.arrayColumn) {
    const array = target.arrayColumn;
    const matches = `LOWER(element ->> '${target.keyColumn}') = LOWER($1::text)
      AND element ->> '${target.nameColumn}' = $2::text`;
    return `UPDATE ${target.table}
      SET ${array} = (
        SELECT jsonb_agg(
          CASE WHEN ${matches}
            THEN jsonb_set(element, '{${target.nameColumn}}', to_jsonb($3::text))
            ELSE element
          END ORDER BY position)
        FROM jsonb_array_elements(${array}) WITH ORDINALITY AS item(element, position))
      WHERE jsonb_typeof(${array}) = 'array'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(${array}) AS item(element)
          WHERE ${matches})${extra}`;
  }

  const matches = isCode
    ? `LOWER(${target.keyColumn}) = LOWER($1)`
    : `${target.keyColumn} = $1`;
  return `UPDATE ${target.table} SET ${target.nameColumn} = $3
    WHERE ${matches} AND ${target.nameColumn} = $2${extra}`;
}
