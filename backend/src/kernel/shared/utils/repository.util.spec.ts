import { NotFoundException } from '@nestjs/common';

import {
  findActiveByIds,
  findActiveByIdsOrThrow,
  findAllByIds,
} from '@shared/utils/repository.util';

import type { BaseEntity } from '@shared/entities/base.entity';
import type { Repository } from 'typeorm';

type Row = BaseEntity;

function repoOf(rows: Array<Partial<Row> & { id: number }>) {
  const find = jest.fn().mockResolvedValue(rows);
  const findOne = jest.fn().mockResolvedValue(null);
  return {
    find,
    findOne,
    repo: { find, findOne } as unknown as Repository<Row>,
  };
}

describe('findActiveByIds', () => {
  it('reads the unique ids in one query over live rows, keyed by id', async () => {
    const { find, repo } = repoOf([{ id: 1 }, { id: 2 }]);
    const map = await findActiveByIds(repo, [1, 2, 1]);
    expect([...map.keys()]).toEqual([1, 2]);
    expect(find).toHaveBeenCalledTimes(1);
    const where = (
      find.mock.calls[0] as [{ where: Record<string, unknown> }]
    )[0].where;
    expect(where.isDeleted).toBe(false);
  });

  it('skips the query for no ids', async () => {
    const { find, repo } = repoOf([]);
    expect((await findActiveByIds(repo, [])).size).toBe(0);
    expect(find).not.toHaveBeenCalled();
  });
});

describe('findAllByIds', () => {
  it('reads by id whatever the delete flag', async () => {
    const { find, repo } = repoOf([{ id: 3 }]);
    const map = await findAllByIds(repo, [3]);
    expect(map.get(3)).toEqual({ id: 3 });
    const where = (
      find.mock.calls[0] as [{ where: Record<string, unknown> }]
    )[0].where;
    expect(where).not.toHaveProperty('isDeleted');
  });

  it('skips the query for no ids', async () => {
    const { find, repo } = repoOf([]);
    expect((await findAllByIds(repo, [])).size).toBe(0);
    expect(find).not.toHaveBeenCalled();
  });
});

describe('findActiveByIdsOrThrow', () => {
  it('returns rows in the order of ids', async () => {
    const { repo } = repoOf([{ id: 1 }, { id: 2 }]);
    const rows = await findActiveByIdsOrThrow(repo, [2, 1], 'Thing');
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it('throws the findActiveByIdOrThrow 404 for the first missing id', async () => {
    const { repo } = repoOf([{ id: 1 }, { id: 3 }]);
    await expect(
      findActiveByIdsOrThrow(repo, [1, 2, 4, 3], 'Thing'),
    ).rejects.toThrow(new NotFoundException('Thing 2 not found'));
  });
});
