import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { bulkApprove } from '@shared/utils/bulk-approve.util';

describe('bulkApprove', () => {
  it('approves every id when none is refused', async () => {
    const approveOne = jest.fn().mockResolvedValue({ id: 1 });

    const result = await bulkApprove([1, 2, 3], approveOne);

    expect(result).toEqual({ approved: [1, 2, 3], failed: [] });
    expect(approveOne).toHaveBeenCalledTimes(3);
  });

  it('keeps approving after a refused row and reports its reason', async () => {
    const approveOne = jest.fn((id: number) =>
      id === 2
        ? Promise.reject(new ForbiddenException('Not your approval step.'))
        : Promise.resolve({ id }),
    );

    const result = await bulkApprove([1, 2, 3], approveOne);

    expect(result.approved).toEqual([1, 3]);
    expect(result.failed).toEqual([
      { id: 2, message: 'Not your approval step.', status: 403 },
    ]);
  });

  it('reports a row that is gone or no longer pending', async () => {
    const approveOne = jest.fn((id: number) =>
      Promise.reject(
        id === 7
          ? new NotFoundException('Record 7 not found')
          : new BadRequestException(['Status is approved', 'not pending']),
      ),
    );

    const result = await bulkApprove([7, 8], approveOne);

    expect(result.approved).toEqual([]);
    expect(result.failed).toEqual([
      { id: 7, message: 'Record 7 not found', status: 404 },
      { id: 8, message: 'Status is approved, not pending', status: 400 },
    ]);
  });

  it('approves a repeated id once', async () => {
    const approveOne = jest.fn().mockResolvedValue(undefined);

    const result = await bulkApprove(['A', 'A', 'B'], approveOne);

    expect(result.approved).toEqual(['A', 'B']);
    expect(approveOne).toHaveBeenCalledTimes(2);
  });

  it('reports a warning raised by an approved row', async () => {
    const approveOne = jest.fn((id: number) =>
      Promise.resolve({ held: id === 2 }),
    );

    const result = await bulkApprove([1, 2], approveOne, {
      warningOf: (outcome) => (outcome.held ? 'returnHeld' : undefined),
    });

    expect(result).toEqual({
      approved: [1, 2],
      failed: [],
      warnings: [{ id: 2, code: 'returnHeld' }],
    });
  });

  it('rethrows a fault that is not a verdict on the row', async () => {
    const approveOne = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('connection lost'));

    await expect(bulkApprove([1, 2], approveOne)).rejects.toThrow(
      'connection lost',
    );
  });
});
