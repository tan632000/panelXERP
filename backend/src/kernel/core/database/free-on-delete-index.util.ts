/**
 * SQL that lets a deleted row release the value it held.
 *
 * Deleting is soft, so a plain `UNIQUE` column or a non-partial unique index keeps the value
 * reserved for good and the author can never re-enter it. Every uniqueness rule on a
 * soft-deleted table is therefore a partial index over live rows only.
 *
 * Dropping by column rather than by name matters: a column-level `UNIQUE` gets a constraint
 * whose generated name differs between databases restored at different times.
 */

/** Drops every non-partial unique index or constraint covering `column` on `table`. */
export function dropNonPartialUnique(table: string, column: string): string {
  return `
    DO $$
    DECLARE rec record;
    BEGIN
      FOR rec IN
        SELECT i.relname AS index_name, con.conname AS constraint_name
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class t ON t.oid = x.indrelid
        LEFT JOIN pg_constraint con ON con.conindid = x.indexrelid
        WHERE t.relname = '${table}'
          AND x.indisunique
          AND NOT x.indisprimary
          AND x.indpred IS NULL
          AND pg_get_indexdef(x.indexrelid) ~* '\\m${column}\\M'
      LOOP
        IF rec.constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE ${table} DROP CONSTRAINT %I', rec.constraint_name);
        ELSE
          EXECUTE format('DROP INDEX %I', rec.index_name);
        END IF;
      END LOOP;
    END $$;
  `;
}

/** Recreates uniqueness over live rows only. */
export function createActiveUniqueIndex(
  indexName: string,
  table: string,
  expression: string,
): string {
  return `
    CREATE UNIQUE INDEX IF NOT EXISTS ${indexName}
    ON ${table} (${expression})
    WHERE is_deleted = false
  `;
}

/**
 * Drops every unique index or constraint covering `column` on `table` whose predicate does
 * not read `is_deleted` — the non-partial ones {@link dropNonPartialUnique} finds, plus the
 * ones partial on something else.
 *
 * `dropNonPartialUnique` keys on `indpred IS NULL`, so an index like
 * `(customer_code) WHERE customer_code IS NOT NULL` slips past it and keeps reserving the
 * value of a deleted row. Prefer this helper; the narrower one stays only because applied
 * migrations embed its SQL.
 */
export function dropUniqueNotFreedOnDelete(
  table: string,
  column: string,
): string {
  return `
    DO $$
    DECLARE rec record;
    BEGIN
      FOR rec IN
        SELECT i.relname AS index_name, con.conname AS constraint_name
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class t ON t.oid = x.indrelid
        LEFT JOIN pg_constraint con ON con.conindid = x.indexrelid
        WHERE t.relname = '${table}'
          AND x.indisunique
          AND NOT x.indisprimary
          AND (
                x.indpred IS NULL
                OR pg_get_expr(x.indpred, x.indrelid) NOT LIKE '%is_deleted%'
              )
          AND pg_get_indexdef(x.indexrelid) ~* '\\m${column}\\M'
      LOOP
        IF rec.constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE ${table} DROP CONSTRAINT %I', rec.constraint_name);
        ELSE
          EXECUTE format('DROP INDEX %I', rec.index_name);
        END IF;
      END LOOP;
    END $$;
  `;
}
