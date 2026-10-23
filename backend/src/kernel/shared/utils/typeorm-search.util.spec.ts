import {
  buildIlikeOrWhere,
  ilikeContains,
  unaccentILike,
} from './typeorm-search.util';

import type { FindOperator } from 'typeorm';

/** The SQL a `Raw` operator renders for a column alias, plus its bound parameters. */
function render(operator: FindOperator<unknown>, alias = 'record.name') {
  const getSql = operator.getSql as (alias: string) => string;
  return {
    sql: getSql(alias),
    params: operator.objectLiteralParameters ?? {},
  };
}

describe('typeorm-search util', () => {
  it('compares accent-folded column and pattern', () => {
    const { sql, params } = render(unaccentILike('%khoá%'));
    const [paramName] = Object.keys(params);

    expect(sql).toBe(
      `erp_unaccent(record.name) ILIKE erp_unaccent(:${paramName})`,
    );
    expect(params[paramName]).toBe('%khoá%');
  });

  it('binds a distinct parameter per call so patterns cannot collide', () => {
    const first = Object.keys(render(unaccentILike('%a%')).params)[0];
    const second = Object.keys(render(unaccentILike('%b%')).params)[0];

    expect(first).not.toBe(second);
  });

  it('wraps a contains search in escaped wildcards', () => {
    const { params } = render(ilikeContains('VT_0007'));

    expect(Object.values(params)).toEqual(['%VT\\_0007%']);
  });

  it('builds one accent-insensitive branch per field', () => {
    const branches = buildIlikeOrWhere(
      { isDeleted: false },
      ['code', 'name'],
      'khoá',
    );

    expect(branches).toHaveLength(2);
    for (const [index, field] of ['code', 'name'].entries()) {
      const branch = (branches as Array<Record<string, unknown>>)[index];
      const { sql } = render(branch[field] as FindOperator<unknown>, 'x');
      expect(sql).toMatch(/^erp_unaccent\(x\) ILIKE erp_unaccent\(:\w+\)$/);
      expect(branch.isDeleted).toBe(false);
    }
  });
});
