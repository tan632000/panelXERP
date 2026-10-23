import { findParentIdsWithLiveLines } from '@shared/utils/parent-live-lines.util';

import type { EntityManager } from 'typeorm';

class FakeLine {
  masterId!: number;
  isDeleted!: boolean;
}

function managerAnswering(rows: Array<{ parentId: string | number }>) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  const createQueryBuilder = jest.fn(() => qb);
  const manager = { createQueryBuilder };
  return {
    qb,
    createQueryBuilder,
    manager: manager as unknown as EntityManager,
  };
}

describe('findParentIdsWithLiveLines', () => {
  it('reads every parent in one grouped query over live lines only', async () => {
    const { qb, manager } = managerAnswering([
      { parentId: '2' },
      { parentId: 5 },
    ]);

    const result = await findParentIdsWithLiveLines(
      manager,
      FakeLine,
      'masterId',
      [1, 2, 5],
    );

    expect([...result]).toEqual([2, 5]);
    expect(qb.where).toHaveBeenCalledWith('line.masterId IN (:...parentIds)', {
      parentIds: [1, 2, 5],
    });
    expect(qb.andWhere).toHaveBeenCalledWith('line.isDeleted = false');
    expect(qb.groupBy).toHaveBeenCalledWith('line.masterId');
    expect(qb.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('does not touch the database for an empty id list', async () => {
    const { manager, createQueryBuilder } = managerAnswering([]);

    await expect(
      findParentIdsWithLiveLines(manager, FakeLine, 'masterId', []),
    ).resolves.toEqual(new Set());
    expect(createQueryBuilder).not.toHaveBeenCalled();
  });
});
