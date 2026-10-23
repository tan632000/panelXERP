import {
  applyColumnSort,
  LIST_SORT_ALIAS,
  resolveColumnSort,
  toColumnSortOrder,
} from '@shared/utils/column-sort.util';

import type { ColumnFilterMap } from '@shared/utils/column-filter.util';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

const MAP: ColumnFilterMap = {
  code: { field: 'code' },
  companyName: { field: 'name', relation: 'company' },
  hasImage: {
    expression: `CASE WHEN "p"."image_url" <> '' THEN 'true' ELSE 'false' END`,
  },
  fgCodes: {
    matchWithExists: {
      table: 'product_fg_variants',
      foreignKey: 'product_id',
      column: 'fg_code',
      where: 'is_deleted = false',
    },
  },
  quantity: {
    matchWithExists: {
      table: 'receipt_lines',
      foreignKey: 'receipt_id',
      sources: [{ column: 'quantity_kg' }, { column: 'quantity_pcs' }],
    },
  },
  moldCode: {
    matchWithJsonbIds: {
      column: 'mold_ids',
      table: 'molds',
      valueColumn: 'code',
      where: 'is_deleted = false',
    },
  },
};

const FALLBACK = { sql: 'item.created_at', direction: 'DESC' as const };

function sortOf(query: { sortBy?: string; sortOrder?: string }) {
  return resolveColumnSort({
    alias: 'item',
    map: MAP,
    query,
    fallback: FALLBACK,
  });
}

describe('resolveColumnSort', () => {
  it('keeps the list default order when nothing is requested', () => {
    expect(sortOf({})).toEqual({
      column: null,
      direction: 'DESC',
      sql: 'item.created_at',
      isExpression: false,
    });
  });

  it('keeps the list default order for a column it cannot sort by', () => {
    expect(sortOf({ sortBy: 'notAColumn', sortOrder: 'ASC' })).toEqual({
      column: null,
      direction: 'DESC',
      sql: 'item.created_at',
      isExpression: false,
    });
  });

  it('sorts a stored column through the list alias, ascending by default', () => {
    expect(sortOf({ sortBy: 'code' })).toEqual({
      column: 'code',
      direction: 'ASC',
      sql: 'item.code',
      isExpression: false,
    });
  });

  it('honours an explicit direction', () => {
    expect(sortOf({ sortBy: 'code', sortOrder: 'DESC' }).direction).toBe(
      'DESC',
    );
  });

  it('sorts a relation column through its relation alias', () => {
    expect(sortOf({ sortBy: 'companyName' }).sql).toBe('company.name');
  });

  it('sorts a composed column by the expression the filter uses', () => {
    expect(sortOf({ sortBy: 'hasImage' }).sql).toBe(MAP.hasImage.expression);
  });

  it('keeps createdAt sortable even though no list filters by it', () => {
    expect(sortOf({ sortBy: 'createdAt', sortOrder: 'ASC' })).toEqual({
      column: 'createdAt',
      direction: 'ASC',
      sql: 'item.createdAt',
      isExpression: false,
    });
  });

  it('keeps createdAt newest first when asked for without a direction', () => {
    expect(sortOf({ sortBy: 'createdAt' }).direction).toBe('DESC');
  });

  it('refuses a column the list declared unsortable', () => {
    const sort = resolveColumnSort({
      alias: 'item',
      map: MAP,
      query: { sortBy: 'code' },
      fallback: FALLBACK,
      unsortable: ['code'],
    });
    expect(sort.column).toBeNull();
  });

  describe('a cell holding several values', () => {
    it('sorts by the smallest, read back without joining the rows', () => {
      const sql = sortOf({ sortBy: 'fgCodes' }).sql;

      expect(sql).toContain('SELECT MIN(related.fg_code)');
      expect(sql).toContain('WHERE related.product_id = item.id');
      expect(sql).toContain('AND related.is_deleted = false');
    });

    it('takes the smallest across every source of a multi-source cell', () => {
      expect(sortOf({ sortBy: 'quantity' }).sql).toContain(
        'LEAST(MIN(related.quantity_kg), MIN(related.quantity_pcs))',
      );
    });

    it('sorts a jsonb id list by the smallest referenced value', () => {
      const sql = sortOf({ sortBy: 'moldCode' }).sql;

      expect(sql).toContain('SELECT MIN(related.code) FROM molds related');
      expect(sql).toContain('jsonb_array_elements(item.mold_ids)');
    });
  });
});

interface QueryBuilderState {
  calls: string[];
  joined: Array<{ alias: { name: string } }>;
}

function queryBuilderStub() {
  const state: QueryBuilderState = { calls: [], joined: [] };

  const qb = {
    orderBy(column: string, direction: string, nulls?: string) {
      state.calls.push(`orderBy:${column} ${direction} ${nulls ?? ''}`.trim());
      return qb;
    },
    addSelect(selection: string, alias: string) {
      state.calls.push(`addSelect:${selection} as ${alias}`);
      return qb;
    },
    addOrderBy(column: string, direction: string) {
      state.calls.push(`addOrderBy:${column} ${direction}`);
      return qb;
    },
    leftJoin(relation: string, alias: string) {
      state.calls.push(`leftJoin:${relation}:${alias}`);
      state.joined.push({ alias: { name: alias } });
      return qb;
    },
    expressionMap: { joinAttributes: state.joined },
  } as unknown as SelectQueryBuilder<ObjectLiteral>;

  return { qb, state };
}

describe('applyColumnSort', () => {
  it('breaks ties on id so a page boundary cannot repeat or skip a row', () => {
    const { qb, state } = queryBuilderStub();

    applyColumnSort(qb, {
      alias: 'item',
      map: MAP,
      query: { sortBy: 'code', sortOrder: 'DESC' },
      fallback: FALLBACK,
    });

    expect(state.calls).toEqual([
      'orderBy:item.code DESC NULLS LAST',
      'addOrderBy:item.id DESC',
    ]);
  });

  it('puts empty cells last whichever way the column is sorted', () => {
    const { qb, state } = queryBuilderStub();

    applyColumnSort(qb, {
      alias: 'item',
      map: MAP,
      query: { sortBy: 'code' },
      fallback: FALLBACK,
    });

    expect(state.calls[0]).toBe('orderBy:item.code ASC NULLS LAST');
  });

  it('orders raw SQL through a dot-free select alias', () => {
    const { qb, state } = queryBuilderStub();

    const sort = applyColumnSort(qb, {
      alias: 'item',
      map: MAP,
      query: { sortBy: 'fgCodes' },
      fallback: FALLBACK,
    });

    expect(sort.isExpression).toBe(true);
    expect(state.calls[0]).toBe(`addSelect:${sort.sql} as ${LIST_SORT_ALIAS}`);
    expect(state.calls[1]).toBe(`orderBy:${LIST_SORT_ALIAS} ASC NULLS LAST`);
    // TypeORM resolves the distinct-id query's ORDER BY by splitting on a dot.
    expect(LIST_SORT_ALIAS).not.toContain('.');
  });

  it('addresses a stored column directly, with no select alias', () => {
    const { qb, state } = queryBuilderStub();

    applyColumnSort(qb, {
      alias: 'item',
      map: MAP,
      query: { sortBy: 'code' },
      fallback: FALLBACK,
    });

    expect(state.calls.some((call) => call.startsWith('addSelect:'))).toBe(
      false,
    );
  });

  it('joins a relation the list has not joined itself', () => {
    const { qb, state } = queryBuilderStub();

    applyColumnSort(qb, {
      alias: 'item',
      map: MAP,
      query: { sortBy: 'companyName' },
      fallback: FALLBACK,
    });

    expect(state.calls).toContain('leftJoin:item.company:company');
  });

  it('leaves a relation the list already joined alone', () => {
    const { qb, state } = queryBuilderStub();
    state.joined.push({ alias: { name: 'company' } });

    applyColumnSort(qb, {
      alias: 'item',
      map: MAP,
      query: { sortBy: 'companyName' },
      fallback: FALLBACK,
    });

    expect(state.calls).not.toContain('leftJoin:item.company:company');
  });

  it('breaks ties on the rows the list actually shows, when it says so', () => {
    const { qb, state } = queryBuilderStub();

    applyColumnSort(qb, {
      alias: 'item',
      map: MAP,
      query: { sortBy: 'code' },
      fallback: FALLBACK,
      // A list of document lines keeps its lines in order inside each document.
      tieBreak: 'line.id',
    });

    expect(state.calls).toContain('addOrderBy:line.id ASC');
    expect(state.calls).not.toContain('addOrderBy:item.id ASC');
  });

  it('applies the list default order untouched when nothing is requested', () => {
    const { qb, state } = queryBuilderStub();

    applyColumnSort(qb, {
      alias: 'item',
      map: MAP,
      query: {},
      fallback: FALLBACK,
    });

    expect(state.calls).toEqual([
      'orderBy:item.created_at DESC NULLS LAST',
      'addOrderBy:item.id DESC',
    ]);
  });
});

describe('toColumnSortOrder', () => {
  const order = (query: { sortBy?: string; sortOrder?: string }) =>
    toColumnSortOrder({
      map: MAP,
      query,
      fallback: { field: 'createdAt', direction: 'DESC' },
    }) as Record<string, unknown>;

  it('keeps the list default order when nothing is requested', () => {
    expect(order({})).toEqual({ createdAt: 'DESC', id: 'DESC' });
  });

  it('orders a stored column with empty cells last, and breaks ties on id', () => {
    expect(order({ sortBy: 'code', sortOrder: 'DESC' })).toEqual({
      code: { direction: 'DESC', nulls: 'last' },
      id: 'DESC',
    });
  });

  it('nests a relation column under its relation', () => {
    expect(order({ sortBy: 'companyName' })).toEqual({
      company: { name: { direction: 'ASC', nulls: 'last' } },
      id: 'ASC',
    });
  });

  it('falls back for a column only a query builder can order', () => {
    expect(order({ sortBy: 'fgCodes' })).toEqual({
      createdAt: 'DESC',
      id: 'DESC',
    });
    expect(order({ sortBy: 'hasImage' })).toEqual({
      createdAt: 'DESC',
      id: 'DESC',
    });
  });

  it('keeps createdAt newest first when asked for without a direction', () => {
    expect(order({ sortBy: 'createdAt' })).toEqual({
      createdAt: 'DESC',
      id: 'DESC',
    });
  });
});
