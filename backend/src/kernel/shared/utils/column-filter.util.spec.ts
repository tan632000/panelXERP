import { FindOperator, ILike } from 'typeorm';

import { parseColumnFilterSelections } from '@shared/dto/column-filter.dto';
import {
  applyColumnFilterQuery,
  existsSourcesMatchSql,
  findColumnValues,
  mergeColumnFilterConditions,
  UnknownColumnFilterError,
  type ColumnFilterMap,
} from '@shared/utils/column-filter.util';

import type { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

const MAP: ColumnFilterMap = {
  code: { field: 'code' },
  classification: { field: 'classification' },
  materialName: { field: 'name', relation: 'material' },
};

function operatorSql(value: unknown): string {
  const operator = value as FindOperator<unknown>;
  return operator.getSql?.('column') ?? '';
}
describe('mergeColumnFilterConditions', () => {
  it('leaves the clause untouched when nothing is selected', () => {
    const where = { isDeleted: false };
    expect(mergeColumnFilterConditions(where, MAP, undefined)).toBe(where);
    expect(mergeColumnFilterConditions(where, MAP, {})).toBe(where);
  });

  it('ignores a column the list does not expose', () => {
    expect(
      mergeColumnFilterConditions({ isDeleted: false }, MAP, {
        secret: ['x'],
      }),
    ).toEqual({ isDeleted: false });
  });

  it('compares the column as text so a blank value selects empty rows', () => {
    const result = mergeColumnFilterConditions({ isDeleted: false }, MAP, {
      code: ['VT-0001', ''],
    }) as Record<string, unknown>;

    expect(operatorSql(result.code)).toBe(
      "COALESCE(CAST(column AS TEXT), '') IN (:...columnFilter_code)",
    );
  });

  it('nests a relation column under its relation', () => {
    const result = mergeColumnFilterConditions({}, MAP, {
      materialName: ['SPCC'],
    }) as { material: Record<string, unknown> };

    expect(operatorSql(result.material.name)).toContain('IN (:...');
  });

  it('narrows every OR branch the keyword search built', () => {
    const branches = mergeColumnFilterConditions(
      [
        { isDeleted: false, name: ILike('%bolt%') },
        { isDeleted: false, code: ILike('%bolt%') },
      ],
      MAP,
      { classification: ['mechanical'] },
    ) as Array<Record<string, unknown>>;

    expect(branches).toHaveLength(2);
    branches.forEach((branch) => {
      expect(branch.classification).toBeInstanceOf(FindOperator);
    });
  });

  it('keeps the search condition of a column that is also filtered', () => {
    const [branch] = mergeColumnFilterConditions(
      [{ code: ILike('%bolt%') }],
      MAP,
      { code: ['BOLT-01'] },
    ) as Array<Record<string, unknown>>;

    const combined = branch.code as FindOperator<unknown>;
    expect(combined.type).toBe('and');
    expect((combined.value as unknown[]).length).toBe(2);
  });
});

interface QueryBuilderStub {
  calls: string[];
  params: Record<string, unknown>;
}

function queryBuilderStub(rows: Array<{ value: string }>, total: number) {
  const state: QueryBuilderStub = { calls: [], params: {} };

  const qb = {
    where(condition: string) {
      state.calls.push(`where:${condition}`);
      return qb;
    },
    andWhere(condition: string, params: Record<string, unknown>) {
      state.calls.push(`andWhere:${condition}`);
      Object.assign(state.params, params);
      return qb;
    },
    leftJoin(relation: string, alias: string) {
      state.calls.push(`leftJoin:${relation}:${alias}`);
      return qb;
    },
    select(expression: string, alias: string) {
      state.calls.push(`select:${expression} as ${alias}`);
      return qb;
    },
    distinct(value: boolean) {
      state.calls.push(`distinct:${String(value)}`);
      return qb;
    },
    orderBy(column: string, direction: string) {
      state.calls.push(`orderBy:${column} ${direction}`);
      return qb;
    },
    offset(value: number) {
      state.calls.push(`offset:${value}`);
      return qb;
    },
    limit(value: number) {
      state.calls.push(`limit:${value}`);
      return qb;
    },
    getRawMany: () => Promise.resolve(rows),
    getRawOne: () => Promise.resolve({ count: String(total) }),
    expressionMap: { joinAttributes: [] },
  } as unknown as SelectQueryBuilder<ObjectLiteral>;

  const repo = {
    createQueryBuilder: () => qb,
  } as unknown as Repository<ObjectLiteral>;

  return { repo, state, qb };
}

describe('findColumnValues', () => {
  it('rejects a column the list does not expose', async () => {
    const { repo } = queryBuilderStub([], 0);

    await expect(
      findColumnValues(
        repo,
        { column: 'secret' },
        {
          alias: 'item',
          map: MAP,
        },
      ),
    ).rejects.toBeInstanceOf(UnknownColumnFilterError);
  });

  it('reads distinct values of the whole table, paginated and searchable', async () => {
    const { repo, state } = queryBuilderStub(
      [{ value: 'VT-0001' }, { value: 'VT-0002' }],
      42,
    );

    const result = await findColumnValues(
      repo,
      { column: 'code', search: 'VT', page: 2, limit: 2 },
      {
        alias: 'item',
        map: MAP,
        applyBaseWhere: (qb, alias) => qb.where(`${alias}.isDeleted = false`),
      },
    );

    expect(result.data).toEqual(['VT-0001', 'VT-0002']);
    expect(result.meta).toEqual({
      page: 2,
      limit: 2,
      total: 42,
      totalPages: 21,
    });
    expect(state.calls).toContain('distinct:true');
    expect(state.calls).toContain('orderBy:value DESC');
    expect(state.calls).toContain('offset:2');
    expect(state.calls).toContain('where:item.isDeleted = false');
    expect(state.params.columnValueSearch).toBe('%VT%');
  });

  it('offers only the values of the rows the other column filters leave', async () => {
    const { repo, state } = queryBuilderStub([{ value: 'VT-0001' }], 1);

    await findColumnValues(
      repo,
      {
        column: 'code',
        columnFilters: { classification: ['special'], code: ['VT-0009'] },
      },
      {
        alias: 'item',
        map: MAP,
        applyBaseWhere: (qb, alias) => qb.where(`${alias}.isDeleted = false`),
      },
    );

    const whereIndex = state.calls.indexOf('where:item.isDeleted = false');
    const filterIndex = state.calls.findIndex((call) =>
      call.includes('item.classification'),
    );
    expect(filterIndex).toBeGreaterThan(whereIndex);
    expect(state.params.columnFilter_classification).toEqual(['special']);
    // The column's own selection never narrows its own value list.
    expect(state.params.columnFilter_code).toBeUndefined();
  });

  it('lets a line list narrow the lines a line column reads its values from', async () => {
    const { repo } = queryBuilderStub([{ value: '904' }], 1);
    const scoped: string[] = [];

    await findColumnValues(
      repo,
      { column: 'quantity' },
      {
        alias: 'receipt',
        map: {
          quantity: {
            matchWithExists: {
              table: 'receipt_lines',
              foreignKey: 'receipt_id',
              column: 'quantity',
            },
          },
          code: { field: 'code' },
        },
        applyRelatedScope: (_qb, relatedAlias, exists) =>
          scoped.push(`${relatedAlias}:${exists.table}`),
      },
    );
    await findColumnValues(
      repo,
      { column: 'code' },
      {
        alias: 'receipt',
        map: { code: { field: 'code' } },
        applyRelatedScope: () => scoped.push('header column'),
      },
    );

    // A header column reads no line, so only the line column is narrowed.
    expect(scoped).toEqual(['related:receipt_lines', 'related:receipt_lines']);
  });

  it('also matches the extra text a column declares for its value search', async () => {
    const { repo, state } = queryBuilderStub([{ value: 'COM_0001' }], 1);

    await findColumnValues(
      repo,
      { column: 'companyCode', search: 'Sunway' },
      {
        alias: 'company',
        map: {
          companyCode: { field: 'code', searchAlso: ['company.name'] },
        },
      },
    );

    expect(state.calls).toContain(
      'andWhere:(erp_unaccent(CAST(company.code AS TEXT)) ILIKE erp_unaccent(:columnValueSearch) OR erp_unaccent(CAST(company.name AS TEXT)) ILIKE erp_unaccent(:columnValueSearch))',
    );
    expect(state.params.columnValueSearch).toBe('%Sunway%');
  });

  it('joins the relation of a related column', async () => {
    const { repo, state } = queryBuilderStub([{ value: 'SPCC' }], 1);

    await findColumnValues(
      repo,
      { column: 'materialName' },
      {
        alias: 'item',
        map: MAP,
      },
    );

    expect(state.calls).toContain('leftJoin:item.material:material');
  });

  describe('applyColumnFilterQuery EXISTS matches', () => {
    function capturingQb() {
      const state: { conditions: string[]; params: Record<string, unknown> } = {
        conditions: [],
        params: {},
      };
      const qb = {
        andWhere(condition: string, params: Record<string, unknown>) {
          state.conditions.push(condition);
          Object.assign(state.params, params);
          return qb;
        },
      } as unknown as SelectQueryBuilder<ObjectLiteral>;
      return { qb, state };
    }

    const EXISTS_MAP: ColumnFilterMap = {
      thamChieu: {
        matchWithExists: {
          table: 'receipt_lines',
          foreignKey: 'receipt_id',
          where: 'is_deleted = false',
          sources: [{ column: 'related_code' }, { column: 'reference_code' }],
        },
      },
      supplierName: {
        matchWithExists: {
          table: 'receipt_lines',
          foreignKey: 'receipt_id',
          where: 'is_deleted = false',
          joins: [
            {
              table: 'companies',
              alias: 'c',
              on: 'c.id = related.supplier_id',
              where: 'is_deleted = false',
            },
          ],
          sources: [{ from: { alias: 'c', column: 'name' } }],
        },
      },
    };

    it('matches a row when ANY source holds a selected value', () => {
      const { qb, state } = capturingQb();

      applyColumnFilterQuery(qb, 'receipt', EXISTS_MAP, {
        thamChieu: ['MRP-1'],
      });

      expect(state.conditions).toHaveLength(1);
      expect(state.conditions[0]).toContain('related.related_code');
      expect(state.conditions[0]).toContain('related.reference_code');
      expect(state.conditions[0]).toContain(' OR ');
      expect(state.params.columnFilter_thamChieu).toEqual(['MRP-1']);
    });

    it('joins the value table inside the EXISTS match', () => {
      const { qb, state } = capturingQb();

      applyColumnFilterQuery(qb, 'receipt', EXISTS_MAP, {
        supplierName: ['ACME'],
      });

      expect(state.conditions).toHaveLength(1);
      expect(state.conditions[0]).toContain(
        'LEFT JOIN companies c ON c.id = related.supplier_id',
      );
      expect(state.conditions[0]).toContain('c.name');
    });

    it('still ignores a column the list does not expose', () => {
      const { qb, state } = capturingQb();

      applyColumnFilterQuery(qb, 'receipt', EXISTS_MAP, { secret: ['x'] });

      expect(state.conditions).toHaveLength(0);
    });
  });

  it('reads a joined table for a value stored as an id elsewhere', async () => {
    const { repo, state } = queryBuilderStub([{ value: 'ACME Corp' }], 1);

    const result = await findColumnValues(
      repo,
      { column: 'supplierName' },
      {
        alias: 'receipt',
        map: {
          supplierName: {
            matchWithExists: {
              table: 'receipt_lines',
              foreignKey: 'receipt_id',
              where: 'is_deleted = false',
              joins: [
                {
                  table: 'companies',
                  alias: 'c',
                  on: 'c.id = related.supplier_id',
                  where: 'is_deleted = false',
                },
              ],
              sources: [{ from: { alias: 'c', column: 'name' } }],
            },
          },
        } satisfies ColumnFilterMap,
      },
    );

    expect(result.data).toEqual(['ACME Corp']);
    expect(state.calls).toContain('leftJoin:receipt_lines:related');
    expect(state.calls).toContain('leftJoin:companies:c');
    expect(state.calls.some((call) => call.includes('c.name'))).toBe(true);
  });

  it('unions every source of a multi-source cell', async () => {
    const { repo } = queryBuilderStub(
      [{ value: 'MRP-1' }, { value: 'SO-9' }],
      99,
    );

    const result = await findColumnValues(
      repo,
      // A keyword skips the blank probe, which this stub answers for every query alike.
      { column: 'thamChieu', search: 'O' },
      {
        alias: 'receipt',
        map: {
          thamChieu: {
            matchWithExists: {
              table: 'receipt_lines',
              foreignKey: 'receipt_id',
              where: 'is_deleted = false',
              sources: [
                { column: 'related_code' },
                { column: 'reference_code' },
              ],
            },
          },
        } satisfies ColumnFilterMap,
      },
    );

    // Both sources return the same stubbed rows, so the union dedupes them.
    expect(result.data).toEqual(['SO-9', 'MRP-1']);
    expect(result.meta.total).toBe(2);
  });

  describe('the blank entry of a multi-source cell', () => {
    const MULTI: ColumnFilterMap = {
      thamChieu: {
        matchWithExists: {
          table: 'receipt_lines',
          foreignKey: 'receipt_id',
          sources: [{ column: 'mrp_no' }, { column: 'reference_no' }],
        },
      },
    };

    it('is not offered for one empty source while the other fills the cell', async () => {
      const { repo, qb } = queryBuilderStub(
        [{ value: 'MRP-1' }, { value: '' }],
        2,
      );
      // No row has every source empty.
      (qb as unknown as { getRawOne: () => Promise<unknown> }).getRawOne = () =>
        Promise.resolve(undefined);

      const result = await findColumnValues(
        repo,
        { column: 'thamChieu' },
        { alias: 'receipt', map: MULTI },
      );

      expect(result.data).toEqual(['MRP-1']);
    });

    it('is offered when a row has every source empty', async () => {
      const { repo, state } = queryBuilderStub([{ value: 'MRP-1' }], 1);

      const result = await findColumnValues(
        repo,
        { column: 'thamChieu' },
        { alias: 'receipt', map: MULTI },
      );

      expect(result.data).toEqual(['MRP-1', '']);
      expect(state.calls).toContainEqual(
        "andWhere:(COALESCE(CAST(related.mrp_no AS TEXT), '') = '' AND COALESCE(CAST(related.reference_no AS TEXT), '') = '')",
      );
    });
  });

  it('computes a value in SQL for a derived cell', async () => {
    const { repo, state } = queryBuilderStub([{ value: '300.0000' }], 1);

    await findColumnValues(
      repo,
      { column: 'stockQuantity' },
      {
        alias: 'receipt',
        map: {
          stockQuantity: {
            matchWithExists: {
              table: 'receipt_lines',
              foreignKey: 'receipt_id',
              where: 'is_deleted = false',
              sources: [
                { expression: '(related.quantity - related.issued_quantity)' },
              ],
            },
          },
        } satisfies ColumnFilterMap,
      },
    );

    expect(
      state.calls.some((call) =>
        call.includes('(related.quantity - related.issued_quantity)'),
      ),
    ).toBe(true);
  });
});

describe('findColumnValues of a jsonb id column', () => {
  const JSONB_MAP: ColumnFilterMap = {
    sfgCode: { field: 'sfgCode' },
    materialCode: {
      matchWithJsonbIds: {
        column: 'material_ids',
        table: 'materials',
        valueColumn: 'code',
        where: 'is_deleted = false',
      },
    },
  };
  const ids = JSONB_MAP.materialCode.matchWithJsonbIds as NonNullable<
    typeof JSONB_MAP.materialCode.matchWithJsonbIds
  >;

  /** A chainable builder that records each call and answers the two reads. */
  function recordingBuilder(raw: { rows: unknown[]; count: string }) {
    const calls: Record<string, unknown[][]> = {};
    const qb: Record<string, jest.Mock> = {};
    for (const method of [
      'from',
      'where',
      'andWhere',
      'select',
      'distinct',
      'orderBy',
      'offset',
      'limit',
    ]) {
      qb[method] = jest.fn((...args: unknown[]) => {
        (calls[method] ??= []).push(args);
        return qb;
      });
    }
    qb.getQuery = jest.fn(() => 'SCOPE_SQL');
    qb.getParameters = jest.fn(() => ({ scopeParam: 1 }));
    qb.getRawMany = jest.fn(() => Promise.resolve(raw.rows));
    qb.getRawOne = jest.fn(() => Promise.resolve({ count: raw.count }));
    return { qb, calls };
  }

  function setup(
    raw = { rows: [{ value: 'M2' }, { value: 'M1' }], count: '2' },
  ) {
    const scope = recordingBuilder({ rows: [], count: '0' });
    const values = recordingBuilder(raw);
    const repo = {
      createQueryBuilder: jest.fn(() => scope.qb),
      manager: { createQueryBuilder: jest.fn(() => values.qb) },
    } as unknown as Repository<ObjectLiteral>;
    return { repo, scope, values };
  }

  it('matches the catalogue against the ids unnested once from the scoped rows', async () => {
    const { repo, scope, values } = setup();
    const applyBaseWhere = jest.fn();

    const result = await findColumnValues(
      repo,
      { column: 'materialCode' },
      { alias: 'product', map: JSONB_MAP, applyBaseWhere },
    );

    expect(applyBaseWhere).toHaveBeenCalledWith(scope.qb, 'product');
    expect(scope.calls.select[0][0]).toBe(
      "(jsonb_array_elements(product.material_ids) #>> '{}')::int",
    );
    expect(values.calls.from[0]).toEqual(['materials', 'related']);
    expect(values.calls.where[0]).toEqual([
      'related.id IN (SCOPE_SQL)',
      { scopeParam: 1 },
    ]);
    expect(values.calls.andWhere[0]).toEqual(['related.is_deleted = false']);
    expect(result.data).toEqual(['M2', 'M1']);
    expect(result.meta.total).toBe(2);
  });

  it('lists the highest value first and pages in the database', async () => {
    const { repo, values } = setup();

    await findColumnValues(
      repo,
      { column: 'materialCode', page: 3, limit: 10 },
      { alias: 'product', map: JSONB_MAP },
    );

    expect(values.calls.distinct[0]).toEqual([true]);
    expect(values.calls.orderBy[0]).toEqual(['value', 'DESC']);
    expect(values.calls.offset[0]).toEqual([20]);
    expect(values.calls.limit[0]).toEqual([10]);
    expect(values.calls.select).toContainEqual([
      "COUNT(DISTINCT COALESCE(CAST(related.code AS TEXT), ''))",
      'count',
    ]);
    expect(values.calls.select).toContainEqual([
      "COALESCE(CAST(related.code AS TEXT), '')",
      'value',
    ]);
  });

  it('narrows the values by the keyword, escaping wildcards', async () => {
    const { repo, values } = setup();

    await findColumnValues(
      repo,
      { column: 'materialCode', search: ' 5% ' },
      { alias: 'product', map: JSONB_MAP },
    );

    expect(values.calls.andWhere).toContainEqual([
      '(erp_unaccent(CAST(related.code AS TEXT)) ILIKE erp_unaccent(:columnValueSearch))',
      { columnValueSearch: '%5\\%%' },
    ]);
  });

  it('scopes the rows by the other columns, never by the listed one', async () => {
    const { repo, scope } = setup();

    await findColumnValues(
      repo,
      {
        column: 'materialCode',
        columnFilters: { sfgCode: ['BTP-1'], materialCode: ['M1'] },
      },
      { alias: 'product', map: JSONB_MAP },
    );

    const conditions = scope.calls.andWhere.map(([sql]) => String(sql));
    expect(conditions.some((sql) => sql.includes('sfgCode'))).toBe(true);
    expect(conditions.some((sql) => sql.includes('material_ids'))).toBe(false);
  });

  it('reads the id out of an object element when the list holds objects', async () => {
    const { repo, scope } = setup();

    await findColumnValues(
      repo,
      { column: 'materialCode' },
      {
        alias: 'product',
        map: {
          materialCode: {
            matchWithJsonbIds: { ...ids, elementKey: 'moldId' },
          },
        },
      },
    );

    expect(scope.calls.select[0][0]).toBe(
      "(jsonb_array_elements(product.material_ids) ->> 'moldId')::int",
    );
  });
});

describe('parseColumnFilterSelections', () => {
  it('parses the JSON map the client sends', () => {
    expect(
      parseColumnFilterSelections('{"code":["A","B"],"classification":[""]}'),
    ).toEqual({ code: ['A', 'B'], classification: [''] });
  });

  it('treats an absent or empty parameter as no filter', () => {
    expect(parseColumnFilterSelections(undefined)).toBeUndefined();
    expect(parseColumnFilterSelections('')).toBeUndefined();
    expect(parseColumnFilterSelections('{"code":[]}')).toBeUndefined();
  });

  it('rejects malformed input instead of filtering by nothing', () => {
    expect(() => parseColumnFilterSelections('not json')).toThrow();
    expect(() => parseColumnFilterSelections('[1,2]')).toThrow();
    expect(() => parseColumnFilterSelections('{"code":"A"}')).toThrow();
  });
});

describe('existsSourcesMatchSql', () => {
  const REFERENCE = {
    table: 'lines',
    foreignKey: 'receipt_id',
    sources: [{ column: 'mrp_no' }, { column: 'reference_no' }],
  };

  it('keeps a single source a plain IN, blank included', () => {
    expect(
      existsSourcesMatchSql(
        { table: 'lines', foreignKey: 'receipt_id', column: 'note' },
        'p',
        [''],
      ),
    ).toBe("COALESCE(CAST(related.note AS TEXT), '') IN (:...p)");
  });

  it('matches blank on a multi-source cell only when every source is empty', () => {
    const sql = existsSourcesMatchSql(REFERENCE, 'p', ['']);
    // A line holding an MRP number shows it, so its empty free reference is no blank cell.
    expect(sql).toContain(
      "(COALESCE(CAST(related.mrp_no AS TEXT), '') IN (:...p) AND COALESCE(CAST(related.mrp_no AS TEXT), '') <> '')",
    );
    expect(sql).toContain(
      "(COALESCE(CAST(related.mrp_no AS TEXT), '') = '' AND COALESCE(CAST(related.reference_no AS TEXT), '') = '')",
    );
  });

  it('adds no all-empty branch when blank is not selected', () => {
    expect(existsSourcesMatchSql(REFERENCE, 'p', ['MRP-1'])).not.toContain(
      "= '' AND",
    );
  });
});
