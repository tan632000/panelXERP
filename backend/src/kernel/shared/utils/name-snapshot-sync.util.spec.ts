import { syncNameSnapshots } from './name-snapshot-sync.util';

import type { EntityManager } from 'typeorm';

describe('syncNameSnapshots', () => {
  const query = jest.fn();
  const manager = { query } as unknown as EntityManager;

  const callOf = (call = 0) => query.mock.calls[call] as [string, unknown[]];
  const sqlOf = (call = 0): string => callOf(call)[0].replace(/\s+/g, ' ');

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([]);
  });

  it('rewrites only rows that still carry the old name, matching the code case-insensitively', async () => {
    await syncNameSnapshots(
      manager,
      [
        {
          table: 'other_material_receipt_ok_lines',
          keyColumn: 'material_code',
          nameColumn: 'material_name',
        },
      ],
      'VTK_0313',
      'Giày bảo hộ XP',
      'Giày bảo hộ XP mới',
    );

    expect(sqlOf()).toBe(
      'UPDATE other_material_receipt_ok_lines SET material_name = $3 WHERE LOWER(material_code) = LOWER($1) AND material_name = $2',
    );
    expect(callOf()[1]).toEqual([
      'VTK_0313',
      'Giày bảo hộ XP',
      'Giày bảo hộ XP mới',
    ]);
  });

  it('matches an id exactly and adds the target condition', async () => {
    await syncNameSnapshots(
      manager,
      [
        {
          table: 'rfq_products',
          keyColumn: 'customer_id',
          nameColumn: 'customer_name',
          where: 'fg_variant_id IS NOT NULL',
        },
      ],
      7,
      'Old',
      'New',
    );

    expect(sqlOf()).toContain('WHERE customer_id = $1 AND customer_name = $2');
    expect(sqlOf()).toContain('AND (fg_variant_id IS NOT NULL)');
  });

  it('rewrites the matching elements of a jsonb array', async () => {
    await syncNameSnapshots(
      manager,
      [
        {
          table: 'kke_inventories',
          arrayColumn: 'lines',
          keyColumn: 'materialId',
          nameColumn: 'materialName',
        },
      ],
      'HC_0026',
      'Old',
      'New',
    );

    const sql = sqlOf();
    expect(sql).toContain('UPDATE kke_inventories SET lines =');
    expect(sql).toContain(
      "jsonb_set(element, '{materialName}', to_jsonb($3::text))",
    );
    expect(sql).toContain("element ->> 'materialName' = $2::text");
  });

  it('does not blank documents when the master name is cleared', async () => {
    await syncNameSnapshots(
      manager,
      [
        {
          table: 'mrps',
          keyColumn: 'material_code',
          nameColumn: 'material_name',
        },
      ],
      'FG_0001_01',
      'Variant A',
      '  ',
    );

    expect(query).not.toHaveBeenCalled();
  });

  it('does nothing when the name did not change', async () => {
    await syncNameSnapshots(
      manager,
      [
        {
          table: 'mrps',
          keyColumn: 'material_code',
          nameColumn: 'material_name',
        },
      ],
      'VT_0001',
      'Same',
      'Same',
    );

    expect(query).not.toHaveBeenCalled();
  });
});
