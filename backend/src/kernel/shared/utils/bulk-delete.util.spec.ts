import { BadRequestException, NotFoundException } from '@nestjs/common';

import { bulkSoftDelete } from '@shared/utils/bulk-delete.util';

describe('bulkSoftDelete', () => {
  it('deletes every id when none is refused', async () => {
    const removeOne = jest.fn().mockResolvedValue({ id: 1 });

    const result = await bulkSoftDelete([1, 2, 3], removeOne);

    expect(result).toEqual({ deleted: [1, 2, 3], failed: [] });
    expect(removeOne).toHaveBeenCalledTimes(3);
  });

  it('keeps deleting after a refused row and reports its reason', async () => {
    const removeOne = jest.fn((id: number) =>
      id === 2
        ? Promise.reject(new BadRequestException('Cannot delete company.'))
        : Promise.resolve({ id }),
    );

    const result = await bulkSoftDelete([1, 2, 3], removeOne);

    expect(result.deleted).toEqual([1, 3]);
    expect(result.failed).toEqual([
      { id: 2, message: 'Cannot delete company.' },
    ]);
  });

  it('reports a row another session already deleted', async () => {
    const removeOne = jest
      .fn()
      .mockRejectedValue(new NotFoundException('Company 7 not found'));

    const result = await bulkSoftDelete([7], removeOne);

    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([{ id: 7, message: 'Company 7 not found' }]);
  });

  it('deletes a repeated id once', async () => {
    const removeOne = jest.fn().mockResolvedValue({ id: 5 });

    const result = await bulkSoftDelete([5, 5, 5], removeOne);

    expect(result.deleted).toEqual([5]);
    expect(removeOne).toHaveBeenCalledTimes(1);
  });

  it('rethrows a fault instead of reporting it as a refusal', async () => {
    const removeOne = jest.fn((id: number) =>
      id === 2
        ? Promise.reject(new Error('connection terminated'))
        : Promise.resolve({ id }),
    );

    await expect(bulkSoftDelete([1, 2, 3], removeOne)).rejects.toThrow(
      'connection terminated',
    );
    expect(removeOne).toHaveBeenCalledTimes(2);
  });

  it('deletes one row at a time so each guard sees the previous delete', async () => {
    const order: string[] = [];
    const removeOne = jest.fn(async (id: number) => {
      order.push(`start:${id}`);
      await Promise.resolve();
      order.push(`end:${id}`);
      return { id };
    });

    await bulkSoftDelete([1, 2], removeOne);

    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });
});
