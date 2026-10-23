import { ConflictException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '@kernel/core/auth/decorators/auth.decorators';
import { UsersController } from '@kernel/core/users/users.controller';

const ACTOR = { userId: 1, username: 'admin' };

describe('UsersController bulk signature approval', () => {
  it('requires the administrator scope', () => {
    const handler = Object.getOwnPropertyDescriptor(
      UsersController.prototype,
      'bulkApproveSignatures',
    )?.value as object;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['*:*']);
  });

  it('approves each waiting signature, audits it, and reports the refused one', async () => {
    const approve = jest.fn((id: number) =>
      id === 2
        ? Promise.reject(new ConflictException('No signature waiting'))
        : Promise.resolve(),
    );
    const track = jest.fn();
    const controller = Object.assign(
      Object.create(UsersController.prototype) as object,
      { signatureReview: { approve }, activityLog: { track } },
    ) as unknown as UsersController;

    const result = await controller.bulkApproveSignatures(
      { ids: [1, 2, 3] },
      ACTOR,
    );

    expect(result.approved).toEqual([1, 3]);
    expect(result.failed).toEqual([
      { id: 2, message: 'No signature waiting', status: 409 },
    ]);
    expect(track).toHaveBeenCalledTimes(2);
  });
});
