import {
  DEFAULT_LIST_SORT_FIELD,
  resolveListSort,
  toListOrder,
} from '@shared/utils/list-query.util';

const SORTABLE = ['createdAt', 'code', 'name'] as const;

describe('resolveListSort', () => {
  it('defaults a list with no sort request to newest first', () => {
    expect(resolveListSort({}, SORTABLE)).toEqual({
      field: DEFAULT_LIST_SORT_FIELD,
      direction: 'DESC',
    });
  });

  it('falls back to newest first when the requested column is not sortable', () => {
    expect(resolveListSort({ sortBy: 'notAColumn' }, SORTABLE)).toEqual({
      field: 'createdAt',
      direction: 'DESC',
    });
  });

  it('honours an explicitly requested sortable column, ascending by default', () => {
    expect(resolveListSort({ sortBy: 'code' }, SORTABLE)).toEqual({
      field: 'code',
      direction: 'ASC',
    });
  });

  it('honours an explicit direction on either column', () => {
    expect(
      resolveListSort({ sortBy: 'code', sortOrder: 'DESC' }, SORTABLE),
    ).toEqual({ field: 'code', direction: 'DESC' });
    expect(
      resolveListSort({ sortBy: 'createdAt', sortOrder: 'ASC' }, SORTABLE),
    ).toEqual({ field: 'createdAt', direction: 'ASC' });
  });

  it('applies an explicit direction to the default column too', () => {
    expect(resolveListSort({ sortOrder: 'ASC' }, SORTABLE)).toEqual({
      field: 'createdAt',
      direction: 'ASC',
    });
  });
});

describe('toListOrder', () => {
  it('breaks ties on id in the same direction', () => {
    expect(toListOrder({ field: 'createdAt', direction: 'DESC' })).toEqual({
      createdAt: 'DESC',
      id: 'DESC',
    });
    expect(toListOrder({ field: 'code', direction: 'ASC' })).toEqual({
      code: 'ASC',
      id: 'ASC',
    });
  });

  it('emits a single key when the sort column is already id', () => {
    expect(toListOrder({ field: 'id', direction: 'DESC' })).toEqual({
      id: 'DESC',
    });
  });

  it('always carries an id key, so paging cannot repeat or skip a row', () => {
    for (const field of ['createdAt', 'code', 'name', 'id']) {
      expect(Object.keys(toListOrder({ field, direction: 'DESC' }))).toContain(
        'id',
      );
    }
  });
});
