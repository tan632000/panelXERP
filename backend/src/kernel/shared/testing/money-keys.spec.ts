import {
  expectNoMoneyKeys,
  findMoneyKeys,
} from '@kernel/shared/testing/money-keys.helper-spec';

describe('money key helper', () => {
  it('finds a money key at any depth, null values included', () => {
    expect(
      findMoneyKeys({
        data: [{ id: 1, lines: [{ unitCost: 5 }], referencePrice: null }],
      }),
    ).toEqual(['$.data[0].lines[0].unitCost', '$.data[0].referencePrice']);
  });

  it('ignores the row count of a page envelope but not a total elsewhere', () => {
    const page = { data: [], meta: { page: 1, limit: 20, total: 3 } };

    expect(findMoneyKeys(page)).toEqual([]);
    expect(findMoneyKeys({ ...page, total: 9 })).toEqual(['$.total']);
  });

  it('reads the rest of a page meta: only total, page and limit are exempt', () => {
    expect(
      findMoneyKeys({
        data: [],
        meta: { page: 1, limit: 20, total: 3, value: 9 },
      }),
    ).toEqual(['$.meta.value']);
  });

  it('lets an allowed key through and fails on the rest', () => {
    expectNoMoneyKeys({ referencePrice: 1 }, ['referencePrice']);
    expect(() =>
      expectNoMoneyKeys({ referencePrice: 1, avgCost: 2 }, ['referencePrice']),
    ).toThrow();
  });
});
