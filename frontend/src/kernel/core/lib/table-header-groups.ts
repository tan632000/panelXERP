/** A header cell spanning adjacent columns that share a group path prefix. */
export interface HeaderGroupCell {
  type: "group";
  label: string;
  /** Index of the first column the group covers. */
  colIndex: number;
  colSpan: number;
}

/** A column's own header cell, drawn once and merged down through the rows below it. */
export interface HeaderLeafCell {
  type: "leaf";
  colIndex: number;
  rowSpan: number;
}

export type HeaderCell = HeaderGroupCell | HeaderLeafCell;

export interface HeaderRows {
  /** Deepest group path; the header has `depth + 1` rows. */
  depth: number;
  /** Cells of each header row, in column order. */
  rows: HeaderCell[][];
}

export function normalizeHeaderGroup(
  headerGroup: string | readonly string[] | undefined,
): string[] {
  if (!headerGroup) return [];
  return (typeof headerGroup === "string" ? [headerGroup] : [...headerGroup])
    .map((label) => label.trim())
    .filter(Boolean);
}

function samePrefix(
  a: readonly string[],
  b: readonly string[],
  level: number,
): boolean {
  for (let index = 0; index <= level; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

/**
 * Lays out a grouped table header.
 *
 * Each run of adjacent columns sharing a group path prefix becomes one cell with a `colSpan`;
 * a column grouped less deeply than the deepest one draws its own header once, with a
 * `rowSpan` through the remaining rows. A group never spans a column outside it, so `A{g}`,
 * `B`, `C{g}` draw `g` twice. The backend builder (`excel-header-layout.ts`) lays out an
 * exported sheet the same way, so the file merges exactly the cells the screen merges.
 */
export function buildHeaderRows(
  columns: ReadonlyArray<{ headerGroup?: string | readonly string[] }>,
): HeaderRows {
  const paths = columns.map((column) =>
    normalizeHeaderGroup(column.headerGroup),
  );
  const depth = paths.reduce((max, path) => Math.max(max, path.length), 0);
  const rows: HeaderCell[][] = Array.from({ length: depth + 1 }, () => []);

  for (let row = 0; row < depth; row += 1) {
    let col = 0;
    while (col < columns.length) {
      if (paths[col].length <= row) {
        col += 1;
        continue;
      }
      let end = col + 1;
      while (
        end < columns.length &&
        paths[end].length > row &&
        samePrefix(paths[col], paths[end], row)
      ) {
        end += 1;
      }
      rows[row].push({
        type: "group",
        label: paths[col][row],
        colIndex: col,
        colSpan: end - col,
      });
      col = end;
    }
  }

  paths.forEach((path, colIndex) => {
    rows[path.length].push({
      type: "leaf",
      colIndex,
      rowSpan: depth + 1 - path.length,
    });
  });
  rows.forEach((cells) => cells.sort((a, b) => a.colIndex - b.colIndex));

  return { depth, rows };
}
