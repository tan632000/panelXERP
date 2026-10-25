import * as fs from 'fs';
import * as path from 'path';

/**
 * Deleting a record must free its values, and deleting is soft: the row stays with
 * `is_deleted = true`. A unique index that does not exclude those rows reserves the name or
 * code for good, and since every pre-check filters `isDeleted: false`, the check passes and
 * the insert then fails on the constraint as a 500. That is how `uq_company_name_lower`
 * behaved in production.
 */

const SRC_DIR = path.join(__dirname, '..', '..', '..');

function walk(dir: string, match: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, match));
      continue;
    }
    if (match(full)) out.push(full);
  }
  return out;
}

/** Tables whose entity extends `BaseEntity`, which is what carries `isDeleted`. */
function softDeletedTables(): Set<string> {
  const tables = new Set<string>();
  for (const file of walk(SRC_DIR, (f) => f.endsWith('.entity.ts'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (!/extends\s+BaseEntity\b/.test(source)) continue;

    const entity = /@Entity\(\s*'([a-z_]+)'/.exec(source);
    if (entity) tables.add(entity[1]);
  }
  return tables;
}

interface UniqueIndex {
  name: string;
  table: string;
  statement: string;
  migration: string;
}

/** Only `up()` counts: `down()` restores an older shape on purpose. */
function upHalf(source: string): string {
  return source.split('async down(')[0];
}

function migrationFiles(): string[] {
  return walk(
    SRC_DIR,
    (f) => f.includes(`${path.sep}migrations${path.sep}`) && f.endsWith('.ts'),
  ).sort();
}

function createdUniqueIndexes(): Map<string, UniqueIndex> {
  const created = new Map<string, UniqueIndex>();

  for (const file of migrationFiles()) {
    const up = upHalf(fs.readFileSync(file, 'utf8'));
    for (const match of up.matchAll(/CREATE\s+UNIQUE\s+INDEX[^`]*?(?=`)/gis)) {
      const statement = match[0].replace(/\s+/g, ' ').trim();
      const name = /INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_0-9]+)/i.exec(
        statement,
      );
      const table = /\bON\s+([a-z_]+)/i.exec(statement);
      if (!name || !table) continue;

      created.set(name[1].toLowerCase(), {
        name: name[1],
        table: table[1],
        statement,
        migration: path.basename(file),
      });
    }
  }
  return created;
}

/** A drop keyed on a column rather than on an index name. */
interface ColumnDrop {
  table: string;
  column: string;
  /** True when it also reaches an index that is partial on something else. */
  coversPartial: boolean;
}

/**
 * Every column-keyed drop, with the reach it actually has.
 *
 * `dropNonPartialUnique` and the inline `DO` blocks it was extracted from select on
 * `indpred IS NULL`, so an index partial on another column survives them —
 * `uq_company_customer_code` (`WHERE customer_code IS NOT NULL`) outlived the replacement
 * meant to retire it that way, and kept reserving the code of every deleted customer.
 * Only `dropUniqueNotFreedOnDelete` selects on the predicate instead.
 */
function columnDrops(): ColumnDrop[] {
  const drops: ColumnDrop[] = [];

  for (const file of migrationFiles()) {
    const up = upHalf(fs.readFileSync(file, 'utf8'));

    for (const block of up.matchAll(/DO \$\$([\s\S]*?)END \$\$/g)) {
      const table = /relname\s*=\s*'([a-z_]+)'/.exec(block[1]);
      if (!table) continue;
      const coversPartial = !/indpred\s+IS\s+NULL/i.test(block[1]);
      for (const column of block[1].matchAll(/\\\\m([a-z_]+)\\\\M/g)) {
        drops.push({ table: table[1], column: column[1], coversPartial });
      }
    }

    for (const call of up.matchAll(
      /(dropNonPartialUnique|dropUniqueNotFreedOnDelete)\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g,
    )) {
      drops.push({
        table: call[2],
        column: call[3],
        coversPartial: call[1] === 'dropUniqueNotFreedOnDelete',
      });
    }
  }
  return drops;
}

/** Names a later migration removed, by index name or by column. */
function droppedIndexes(created: Map<string, UniqueIndex>): Set<string> {
  const dropped = new Set<string>();

  for (const file of migrationFiles()) {
    const up = upHalf(fs.readFileSync(file, 'utf8'));

    for (const match of up.matchAll(
      /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?([A-Za-z_0-9."]+)/gi,
    )) {
      dropped.add(match[1].replace(/"/g, '').toLowerCase());
    }
  }

  const drops = columnDrops();

  for (const [key, index] of created) {
    const isPartial = /\bWHERE\b/i.test(index.statement);
    const freesOnDelete = /\bWHERE\b[\s\S]*is_deleted/i.test(index.statement);

    for (const drop of drops) {
      if (drop.table !== index.table) continue;
      if (drop.coversPartial ? freesOnDelete : isPartial) continue;
      if (new RegExp(`\\b${drop.column}\\b`).test(index.statement)) {
        dropped.add(key);
      }
    }
  }
  return dropped;
}

/** Columns declared `UNIQUE` inside a `CREATE TABLE`, which can never be partial. */
function columnUniqueConstraints(): Array<{
  table: string;
  column: string;
  migration: string;
}> {
  const found: Array<{ table: string; column: string; migration: string }> = [];

  for (const file of migrationFiles()) {
    const up = upHalf(fs.readFileSync(file, 'utf8'));
    for (const table of up.matchAll(
      /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-z_]+)\s*\(([\s\S]*?)\n\s*\)/gi,
    )) {
      for (const line of table[2].split('\n')) {
        if (!/\bUNIQUE\b/i.test(line)) continue;
        const column = /^\s*([a-z_]+)\s/.exec(line);
        if (column) {
          found.push({
            table: table[1],
            column: column[1],
            migration: path.basename(file),
          });
        }
      }
    }
  }
  return found;
}

/**
 * Columns a later migration released: by constraint name, through a `DO` block keyed on the
 * column, or through the `dropNonPartialUnique` / `dropUniqueNotFreedOnDelete` helpers
 * that wrap that block.
 */
function releasedColumns(): Set<string> {
  const released = new Set<string>();

  for (const file of migrationFiles()) {
    const up = upHalf(fs.readFileSync(file, 'utf8'));

    for (const match of up.matchAll(
      /ALTER TABLE\s+([a-z_]+)\s+DROP CONSTRAINT\s+(?:IF EXISTS\s+)?"?([a-z_0-9]+)"?/gi,
    )) {
      released.add(`${match[1]}.${match[2].toLowerCase()}`);
    }

    for (const call of up.matchAll(
      /(?:dropNonPartialUnique|dropUniqueNotFreedOnDelete)\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g,
    )) {
      released.add(`${call[1]}.${call[2]}`);
    }

    for (const block of up.matchAll(/DO \$\$([\s\S]*?)END \$\$/g)) {
      const table = /relname\s*=\s*'([a-z_]+)'/.exec(block[1]);
      if (!table) continue;
      for (const column of block[1].matchAll(/\\\\m([a-z_]+)\\\\M/g)) {
        released.add(`${table[1]}.${column[1]}`);
      }
    }
  }
  return released;
}

/**
 * Document numbers are the deliberate exception: a quote number that has been issued stays
 * reserved after its document is deleted, so the same number never names two documents. The
 * creators of these documents retry on a lost race (`createWithDocumentCode`), which is why
 * they can rely on the index counting deleted rows.
 */
const DOCUMENT_NUMBER_INDEXES: ReadonlySet<string> = new Set([
  'uq_sales_requests_code',
  'uq_sales_estimates_code',
]);

describe('unique indexes free the values of a deleted record', () => {
  const created = createdUniqueIndexes();
  const dropped = droppedIndexes(created);
  const softTables = softDeletedTables();

  it('reads the schema out of the migrations and the entities', () => {
    // The kernel's own soft-deleted tables must be found before any plugin table is counted.
    expect(created.size).toBeGreaterThan(0);
    expect(softTables.has('users')).toBe(true);
    expect(softTables.has('roles')).toBe(true);
  });

  it('leaves no column-level UNIQUE on a soft-deleted table', () => {
    const released = releasedColumns();
    const reserving: string[] = [];

    for (const { table, column, migration } of columnUniqueConstraints()) {
      if (!softTables.has(table)) continue;
      if (released.has(`${table}.${column}`)) continue;
      if (released.has(`${table}.${table}_${column}_key`)) continue;

      reserving.push(
        `${table}.${column} (${migration}) — ` +
          'a plain UNIQUE counts deleted rows, so the value stays reserved',
      );
    }

    expect(reserving).toEqual([]);
  });

  it('excludes deleted rows from every unique index on a soft-deleted table', () => {
    const reserving: string[] = [];

    for (const [key, index] of created) {
      if (dropped.has(key)) continue;
      if (!softTables.has(index.table)) continue;
      if (/is_deleted/i.test(index.statement)) continue;
      if (DOCUMENT_NUMBER_INDEXES.has(key)) continue;

      reserving.push(
        `${index.table}.${index.name} (${index.migration}) — ` +
          'a deleted row keeps reserving this value',
      );
    }

    expect(reserving).toEqual([]);
  });
});
