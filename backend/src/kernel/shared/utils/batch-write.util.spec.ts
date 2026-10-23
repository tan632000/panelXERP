import {
  insertRows,
  softDeleteRows,
  updateRowsById,
} from '@shared/utils/batch-write.util';

function runner() {
  const query = jest.fn().mockResolvedValue(undefined);
  return { query, manager: { query } };
}

describe('insertRows', () => {
  it('inserts all rows with one numbered-placeholder statement', async () => {
    const { query, manager } = runner();
    await insertRows(
      manager,
      't',
      ['a', 'b'],
      [
        [1, 'x'],
        [2, 'y'],
      ],
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'INSERT INTO t (a, b) VALUES ($1, $2), ($3, $4)',
      [1, 'x', 2, 'y'],
    );
  });

  it('does nothing for no rows', async () => {
    const { query, manager } = runner();
    await insertRows(manager, 't', ['a'], []);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('updateRowsById', () => {
  it('updates every row with one unnest statement and stamps the audit columns', async () => {
    const { query, manager } = runner();
    await updateRowsById(
      manager,
      't',
      [
        ['qty', 'numeric'],
        ['note', 'text'],
      ],
      [
        { id: '1', values: [5, 'a'] },
        { id: 2, values: [6] },
      ],
      9,
    );
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      'SET qty = v.qty, note = v.note, updated_at = NOW(), updated_by = $4',
    );
    expect(sql).toContain(
      'unnest($1::int[], $2::numeric[], $3::text[]) AS v(id, qty, note)',
    );
    expect(sql).toContain('WHERE t.id = v.id');
    expect(params).toEqual([[1, 2], [5, 6], ['a', null], 9]);
  });

  it('does nothing for no rows', async () => {
    const { query, manager } = runner();
    await updateRowsById(manager, 't', [['a', 'int']], [], 1);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('softDeleteRows', () => {
  it('soft-deletes by key column with one statement', async () => {
    const { query, manager } = runner();
    await softDeleteRows(manager, 't', 'doc_id', ['1', 2], 7);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE doc_id = ANY($1::int[])');
    expect(sql).not.toContain('AND is_deleted = false');
    expect(params).toEqual([[1, 2], 7]);
  });

  it('restricts to live rows on request', async () => {
    const { query, manager } = runner();
    await softDeleteRows(manager, 't', 'id', [1], 7, { liveOnly: true });
    expect((query.mock.calls[0] as [string])[0]).toContain(
      'AND is_deleted = false',
    );
  });

  it('does nothing for no ids', async () => {
    const { query, manager } = runner();
    await softDeleteRows(manager, 't', 'id', [], 7);
    expect(query).not.toHaveBeenCalled();
  });
});
