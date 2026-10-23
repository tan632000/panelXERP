import {
  computedColumnValues,
  matchesComputedFilters,
  sortByComputedColumn,
  splitComputedFilters,
  type ComputedColumnMap,
} from '@shared/utils/computed-sort.util';

/**
 * The contract the six production lists rely on for the cells the database cannot produce:
 * a gateway total, a catalogue name, a jsonb list of bath codes. Their seed data holds one
 * distinct value per column, so only a test can hold the ordering rules still.
 */
interface Row {
  code: string;
  completed: number | null;
  weight: string;
  baths: string[];
  qty: number;
}

const MAP: ComputedColumnMap = {
  completed: 'completed',
  weight: 'weight',
  baths: 'baths',
  progress: (row) => Math.round((Number(row.qty) / 200) * 100),
};

const rows: Row[] = [
  { code: 'A', completed: 9, weight: '12.50', baths: ['B2', 'B9'], qty: 50 },
  { code: 'B', completed: null, weight: '9.00', baths: [], qty: 200 },
  { code: 'C', completed: 100, weight: '100.00', baths: ['B1'], qty: 100 },
];

const codes = (result: Row[]): string[] => result.map((row) => row.code);

describe('sortByComputedColumn', () => {
  it('compares numbers as numbers, not as text', () => {
    expect(
      codes(
        sortByComputedColumn(
          rows,
          { sortBy: 'completed', sortOrder: 'ASC' },
          MAP,
        ),
      ),
    ).toEqual(['A', 'C', 'B']);
  });

  it('compares a numeric string by its value', () => {
    expect(
      codes(
        sortByComputedColumn(rows, { sortBy: 'weight', sortOrder: 'ASC' }, MAP),
      ),
    ).toEqual(['B', 'A', 'C']);
  });

  it('keeps empty cells last in both directions', () => {
    const ascending = sortByComputedColumn(
      rows,
      { sortBy: 'completed', sortOrder: 'ASC' },
      MAP,
    );
    const descending = sortByComputedColumn(
      rows,
      { sortBy: 'completed', sortOrder: 'DESC' },
      MAP,
    );
    expect(codes(ascending).at(-1)).toBe('B');
    expect(codes(descending).at(-1)).toBe('B');
  });

  it('orders a multi-valued cell by its smallest value', () => {
    // A holds B2 and B9, C holds B1: C leads ascending although A's list reaches further down.
    expect(
      codes(
        sortByComputedColumn(rows, { sortBy: 'baths', sortOrder: 'ASC' }, MAP),
      ),
    ).toEqual(['C', 'A', 'B']);
  });

  it('orders by a rule over the row, not only by a property', () => {
    expect(
      codes(
        sortByComputedColumn(
          rows,
          { sortBy: 'progress', sortOrder: 'DESC' },
          MAP,
        ),
      ),
    ).toEqual(['B', 'C', 'A']);
  });

  it('leaves the query order alone for a column the database sorts', () => {
    expect(
      codes(
        sortByComputedColumn(rows, { sortBy: 'code', sortOrder: 'DESC' }, MAP),
      ),
    ).toEqual(['A', 'B', 'C']);
  });
});

describe('matchesComputedFilters', () => {
  it('keeps a row when any value of a multi-valued cell is selected', () => {
    expect(matchesComputedFilters(rows[0], { baths: ['B9'] }, MAP)).toBe(true);
    expect(matchesComputedFilters(rows[2], { baths: ['B9'] }, MAP)).toBe(false);
  });

  it('matches an empty cell by the blank value', () => {
    expect(matchesComputedFilters(rows[1], { completed: [''] }, MAP)).toBe(
      true,
    );
  });

  it('requires every filtered column to match', () => {
    expect(
      matchesComputedFilters(rows[0], { baths: ['B2'], completed: ['9'] }, MAP),
    ).toBe(true);
    expect(
      matchesComputedFilters(rows[0], { baths: ['B2'], completed: ['8'] }, MAP),
    ).toBe(false);
  });
});

describe('computedColumnValues', () => {
  it('lists every value of a multi-valued cell, highest first', () => {
    expect(computedColumnValues(rows, 'baths', MAP)).toEqual([
      'B9',
      'B2',
      'B1',
      '',
    ]);
  });

  it('orders numbers numerically rather than as text', () => {
    expect(computedColumnValues(rows, 'completed', MAP)).toEqual([
      '100',
      '9',
      '',
    ]);
  });
});

describe('splitComputedFilters', () => {
  it('sends only the unknown keys to SQL, so the filter map never sees a computed one', () => {
    expect(
      splitComputedFilters({ completed: ['9'], code: ['A'] }, MAP),
    ).toEqual({
      sql: { code: ['A'] },
      computed: { completed: ['9'] },
    });
  });

  it('leaves both halves absent when nothing is selected', () => {
    expect(splitComputedFilters(undefined, MAP)).toEqual({
      sql: undefined,
      computed: undefined,
    });
  });
});
