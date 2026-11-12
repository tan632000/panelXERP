import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { holds } from '@kernel/core/database/seeds/permission-scope-conversion';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';

const MATRIX_FILE = 'role-matrix.md';
const MATRIX_HEADING = '## 3. Ma trận quyền';
const GRANTED = '✅';
const REQUIRED_ROWS = [
  'estimate:price',
  'reference_price:read',
  'purchase_price:read',
];

/** Backend root: `/app` in the container, `<repo>/backend` on the host. */
const BACKEND_ROOT = resolve(__dirname, '../../../../..');

/** The container mounts `docs/permission` under the backend root; the host keeps it beside it. */
const CANDIDATE_PATHS = [
  resolve(BACKEND_ROOT, 'docs/permission', MATRIX_FILE),
  resolve(BACKEND_ROOT, '../docs/permission', MATRIX_FILE),
];

interface MatrixRow {
  scope: string;
  /** Role code to whether the cell holds ✅. */
  cells: Map<string, boolean>;
}

function readMatrixDoc(): string {
  const found = CANDIDATE_PATHS.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      `${MATRIX_FILE} not found; looked in:\n${CANDIDATE_PATHS.join('\n')}`,
    );
  }
  return readFileSync(found, 'utf8');
}

const splitCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

/** Header role codes and scope rows of the table under the matrix heading. */
function parseMatrix(doc: string): { roles: string[]; rows: MatrixRow[] } {
  const lines = doc.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(MATRIX_HEADING));
  if (start < 0) throw new Error(`Heading "${MATRIX_HEADING}" not found`);
  const tableLines: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (line.trim().startsWith('|')) tableLines.push(line);
  }
  const header = tableLines.find((line) => /^\|\s*Quyền\s*\|/.test(line));
  if (!header) throw new Error('Matrix header row (Quyền | roles) not found');
  const roles = splitCells(header)
    .slice(1)
    .map((cell) => cell.replace(/`/g, ''));

  const rows: MatrixRow[] = [];
  for (const line of tableLines) {
    const cells = splitCells(line);
    const scope = /^`([^`]+)`$/.exec(cells[0] ?? '')?.[1];
    if (!scope) continue;
    if (cells.length !== roles.length + 1) {
      throw new Error(
        `Row ${scope} has ${cells.length - 1} role cells, header has ${roles.length}`,
      );
    }
    rows.push({
      scope,
      cells: new Map(
        roles.map((role, index) => [role, cells[index + 1] === GRANTED]),
      ),
    });
  }
  return { roles, rows };
}

describe('role matrix document', () => {
  const { roles, rows } = parseMatrix(readMatrixDoc());

  it('lists a column for every role it names, all of them seeded', () => {
    expect(roles.length).toBeGreaterThan(0);
    const unseeded = roles.filter((role) => !seededRolePermissions(role));
    expect(unseeded).toEqual([]);
  });

  it.each(REQUIRED_ROWS)('has a row for %s', (scope) => {
    expect(rows.map((row) => row.scope)).toContain(scope);
  });

  it('matches holds() over the seeded roles in every cell', () => {
    const mismatches: string[] = [];
    for (const { scope, cells } of rows) {
      for (const [role, documented] of cells) {
        const granted = new Set(seededRolePermissions(role) ?? []);
        const actual = holds(granted, scope);
        if (documented !== actual) {
          mismatches.push(
            `${scope} x ${role}: doc ${documented ? GRANTED : 'empty'}, seed ${actual ? GRANTED : 'empty'}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});
