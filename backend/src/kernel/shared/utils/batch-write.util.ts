import type { EntityManager } from 'typeorm';

type QueryRunner = Pick<EntityManager, 'query'>;

/**
 * Inserts every row with one statement instead of one per row. `columns` are the column names,
 * each row holds one value per column in the same order. Rows keep their order, so generated
 * ids follow it.
 */
export async function insertRows(
  manager: QueryRunner,
  table: string,
  columns: readonly string[],
  rows: ReadonlyArray<readonly unknown[]>,
): Promise<void> {
  if (rows.length === 0) return;
  const tuples = rows.map(
    (_row, rowIndex) =>
      `(${columns.map((_c, i) => `$${rowIndex * columns.length + i + 1}`).join(', ')})`,
  );
  await manager.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`,
    rows.flat(),
  );
}

/**
 * Sets the given columns of many rows, matched by id, with one statement. `columns` pairs each
 * column with its Postgres type (the arrays are cast to it); each row lists its id and one value
 * per column, in order. `updated_at` and `updated_by` are stamped on every row.
 */
export async function updateRowsById(
  manager: QueryRunner,
  table: string,
  columns: ReadonlyArray<
    readonly [name: string, type: 'int' | 'text' | 'numeric']
  >,
  rows: ReadonlyArray<{ id: number | string; values: readonly unknown[] }>,
  updatedBy: number,
): Promise<void> {
  if (rows.length === 0) return;
  const arrays = [
    rows.map((row) => Number(row.id)),
    ...columns.map((_column, i) => rows.map((row) => row.values[i] ?? null)),
  ];
  const unnest = ['int', ...columns.map(([, type]) => type)]
    .map((type, i) => `$${i + 1}::${type}[]`)
    .join(', ');
  const alias = ['id', ...columns.map(([name]) => name)].join(', ');
  const assignments = columns.map(([name]) => `${name} = v.${name}`).join(', ');
  await manager.query(
    `UPDATE ${table} AS t
        SET ${assignments}, updated_at = NOW(), updated_by = $${columns.length + 2}
       FROM unnest(${unnest}) AS v(${alias})
      WHERE t.id = v.id`,
    [...arrays, updatedBy],
  );
}

/** Soft-deletes every row whose `keyColumn` is one of `ids` with one statement. */
export async function softDeleteRows(
  manager: QueryRunner,
  table: string,
  keyColumn: string,
  ids: ReadonlyArray<number | string>,
  deletedBy: number,
  options: { liveOnly?: boolean } = {},
): Promise<void> {
  if (ids.length === 0) return;
  await manager.query(
    `UPDATE ${table}
        SET is_deleted = true, deleted_at = NOW(), deleted_by = $2, updated_by = $2
      WHERE ${keyColumn} = ANY($1::int[])${options.liveOnly ? ' AND is_deleted = false' : ''}`,
    [ids.map(Number), deletedBy],
  );
}
