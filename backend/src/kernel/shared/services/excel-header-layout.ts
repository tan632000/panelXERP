/** One drawn header cell, 0-based, spanning `rowSpan` rows and `colSpan` columns. */
export interface ExcelHeaderCell {
  label: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  /** Set only on a column's own leaf cell, to the spec column's index. */
  columnIndex?: number;
}

export interface ExcelHeaderLayout {
  /** Deepest group path; the header has `depth + 1` rows. */
  depth: number;
  cells: ExcelHeaderCell[];
}

interface HeaderColumn {
  label: string;
  headerGroup?: readonly string[];
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
 * Lays out a multi-row header the way the list table draws it.
 *
 * Mirrors `buildHeaderRows` in the frontend kernel: each run of adjacent columns sharing a
 * group path prefix becomes one horizontally merged cell, and a column grouped less deeply
 * than the deepest one draws its label once, merged down through the remaining rows. A group
 * never spans a column outside it, so `A{g}`, `B`, `C{g}` draw `g` twice.
 */
export function buildHeaderLayout(
  columns: readonly HeaderColumn[],
): ExcelHeaderLayout {
  const paths = columns.map((column) => column.headerGroup ?? []);
  const depth = paths.reduce((max, path) => Math.max(max, path.length), 0);
  const cells: ExcelHeaderCell[] = [];

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
      cells.push({
        label: paths[col][row],
        row,
        col,
        rowSpan: 1,
        colSpan: end - col,
      });
      col = end;
    }
  }

  columns.forEach((column, col) => {
    const row = paths[col].length;
    cells.push({
      label: column.label,
      row,
      col,
      rowSpan: depth + 1 - row,
      colSpan: 1,
      columnIndex: col,
    });
  });

  return { depth, cells };
}
