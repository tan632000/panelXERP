import { groupBy } from '@shared/utils/group-by.util';

describe('groupBy', () => {
  it('groups rows by key and keeps input order inside each group', () => {
    const rows = [
      { id: 1, k: 'a' },
      { id: 2, k: 'b' },
      { id: 3, k: 'a' },
    ];
    const groups = groupBy(rows, (r) => r.k);
    expect([...groups.keys()]).toEqual(['a', 'b']);
    expect(groups.get('a')?.map((r) => r.id)).toEqual([1, 3]);
    expect(groups.get('b')?.map((r) => r.id)).toEqual([2]);
  });

  it('returns an empty map for no rows', () => {
    expect(groupBy([], (r: number) => r).size).toBe(0);
  });
});
