import { countActiveReferences } from './reference-count.util';

import type { EntityManager } from 'typeorm';

describe('countActiveReferences', () => {
  const query = jest.fn();
  const manager = { query } as unknown as EntityManager;

  const callOf = (call = 0) => query.mock.calls[call] as [string, unknown[]];
  const sqlOf = (call = 0): string => callOf(call)[0].replace(/\s+/g, ' ');

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([{ count: 2 }]);
  });

  it('matches an id exactly and counts only live rows', async () => {
    await expect(
      countActiveReferences(
        manager,
        [{ table: 'orders', column: 'customer_id' }],
        7,
      ),
    ).resolves.toBe(2);

    expect(sqlOf()).toContain('FROM orders source');
    expect(sqlOf()).toContain('source.customer_id = $1');
    expect(sqlOf()).toContain('source.is_deleted = false');
    expect(sqlOf()).not.toContain('JOIN');
    expect(callOf()[1]).toEqual([7]);
  });

  it('matches a code regardless of case', async () => {
    await countActiveReferences(
      manager,
      [{ table: 'mrps', column: 'material_code' }],
      'VTK_0313',
    );

    expect(sqlOf()).toContain('LOWER(source.material_code) = LOWER($1)');
    expect(callOf()[1]).toEqual(['VTK_0313']);
  });

  it('requires the header to be live when a parent is named', async () => {
    await countActiveReferences(
      manager,
      [
        {
          table: 'purchase_order_lines',
          column: 'material_code',
          parent: { table: 'purchase_orders', column: 'purchase_order_id' },
        },
      ],
      'VT_0001',
    );

    expect(sqlOf()).toContain(
      'JOIN purchase_orders parent1 ON parent1.id = source.purchase_order_id AND parent1.is_deleted = false',
    );
  });

  it('walks a parent chain and skips is_deleted where a table has none', async () => {
    await countActiveReferences(
      manager,
      [
        {
          table: 'quotation_version_products',
          column: 'material_id',
          softDeletable: false,
          parent: {
            table: 'quotation_versions',
            column: 'quotation_version_id',
            softDeletable: false,
            parent: { table: 'quotations', column: 'quotation_id' },
          },
        },
      ],
      5,
    );

    const sql = sqlOf();
    expect(sql).toContain(
      'JOIN quotation_versions parent1 ON parent1.id = source.quotation_version_id JOIN',
    );
    expect(sql).toContain(
      'JOIN quotations parent2 ON parent2.id = parent1.quotation_id AND parent2.is_deleted = false',
    );
    expect(sql).not.toContain('source.is_deleted');
    expect(sql).not.toContain('parent1.is_deleted');
  });

  it('looks inside a jsonb array of objects by key', async () => {
    await countActiveReferences(
      manager,
      [
        {
          table: 'kke_inventories',
          column: 'lines',
          jsonArrayKey: 'materialId',
        },
      ],
      'HC_0026',
    );

    expect(sqlOf()).toContain(
      "source.lines @> jsonb_build_array(jsonb_build_object('materialId', $1::text))",
    );
  });

  it('skips a table this environment does not have', async () => {
    query.mockRejectedValueOnce(
      Object.assign(new Error('x'), { code: '42P01' }),
    );

    await expect(
      countActiveReferences(
        manager,
        [
          { table: 'missing', column: 'code' },
          { table: 'mrps', column: 'material_code' },
        ],
        'VT_0001',
      ),
    ).resolves.toBe(2);
  });
});
