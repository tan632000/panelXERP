import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';

import { AuthPrincipalCache } from '@kernel/core/auth/auth-principal-cache.service';
import { UserSession } from '@kernel/core/auth/entities/user-session.entity';
import { Role } from '@kernel/core/users/entities/role.entity';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';
import { UsersService } from '@kernel/core/users/users.service';

import { S3StorageService } from '@shared/services/s3-storage.service';

async function buildService(
  user: Partial<User> | null,
  options: { role?: Partial<Role> | null } = {},
) {
  const userRepo = {
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn().mockResolvedValue(user),
    create: jest.fn().mockImplementation((entity: Partial<User>) => entity),
    save: jest.fn().mockImplementation((entity: User) => entity),
    softRemove: jest.fn().mockResolvedValue(undefined),
  };
  const roleRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest
      .fn()
      .mockResolvedValue(
        options.role === undefined
          ? ({ id: 3, code: 'sale_staff' } as Role)
          : options.role,
      ),
  };
  const userRoleRepo = {
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    create: jest.fn().mockImplementation((entity: Partial<UserRole>) => entity),
    save: jest.fn().mockImplementation((entity: UserRole) => entity),
  };

  const sessionRepo = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const s3 = {
    getSignedUrl: jest
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(`https://files.example.com/${key}?signed`),
      ),
  };

  const module = await Test.createTestingModule({
    providers: [
      AuthPrincipalCache,
      UsersService,
      { provide: getRepositoryToken(UserSession), useValue: sessionRepo },
      { provide: getRepositoryToken(User), useValue: userRepo },
      { provide: getRepositoryToken(Role), useValue: roleRepo },
      { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
      { provide: S3StorageService, useValue: s3 },
    ],
  }).compile();

  return {
    service: module.get(UsersService),
    userRepo,
    roleRepo,
    userRoleRepo,
    sessionRepo,
    cache: module.get(AuthPrincipalCache),
  };
}

describe('UsersService.resetPassword', () => {
  it('writes the new password and drops the target account sessions', async () => {
    // An administrator resets a password precisely when the account may be in the wrong
    // hands, so leaving a usable refresh token behind would defeat the reset.
    const { service, userRepo, sessionRepo } = await buildService({
      id: 7,
      passwordHash: bcrypt.hashSync('OldPass123', 4),
      refreshToken: 'stored-hash',
    });

    await expect(
      service.resetPassword(7, { newPassword: 'NewPass123!' }),
    ).resolves.toEqual({ success: true });

    const [saved] = userRepo.save.mock.calls[0] as [User];
    expect(bcrypt.compareSync('NewPass123!', saved.passwordHash)).toBe(true);
    expect(saved.refreshToken).toBeNull();
    expect(sessionRepo.update).toHaveBeenCalledWith(
      { userId: 7, isDeleted: false },
      expect.objectContaining({ isDeleted: true }),
    );
  });

  it('reports an unknown account instead of writing', async () => {
    const { service, userRepo } = await buildService(null);

    await expect(
      service.resetPassword(404, { newPassword: 'NewPass123!' }),
    ).rejects.toThrow('User not found');
    expect(userRepo.save).not.toHaveBeenCalled();
  });
});

describe('UsersService account administration', () => {
  it('replaces the role assignment rather than adding a second one', async () => {
    const { service, userRepo, userRoleRepo } = await buildService(null);
    // The identity checks find nothing, then `findOne` answers the created row back.
    userRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 21, username: 'planner' });
    userRepo.save.mockResolvedValue({ id: 21 });

    await service.create(
      {
        username: 'planner',
        email: 'planner@example.com',
        fullName: 'Nguyen Van Ke Hoach',
        roleCode: 'planner',
      },
      1,
    );

    expect(userRoleRepo.delete).toHaveBeenCalledWith({ userId: 21 });
    expect(userRoleRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 21, roleId: 3, assignedBy: 1 }),
    );
  });

  it('refuses an account whose username is already taken', async () => {
    const { service, userRepo } = await buildService(null);
    userRepo.findOne.mockResolvedValue({ id: 9 });

    await expect(
      service.create(
        {
          username: 'planner',
          email: 'planner@example.com',
          fullName: 'Nguyen Van Ke Hoach',
          roleCode: 'planner',
        },
        1,
      ),
    ).rejects.toThrow('Username is already in use');
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('drops the refresh token when an account is deactivated', async () => {
    const { service, userRepo } = await buildService({
      id: 7,
      isActive: true,
      refreshToken: 'stored-hash',
    });

    await service.setActive(7, { isActive: false }, 1);

    const [saved] = userRepo.save.mock.calls[0] as [User];
    expect(saved.isActive).toBe(false);
    expect(saved.refreshToken).toBeNull();
  });

  it('evicts the cached principal of a deactivated account at once', async () => {
    const { service, cache } = await buildService({ id: 7, isActive: true });
    cache.set(7, 41, {
      userId: 7,
      username: 'keeper',
      email: 'k@example.com',
      role: 'warehouse_keeper',
      permissions: [],
      sessionId: 41,
    });

    await service.setActive(7, { isActive: false }, 1);

    expect(cache.get(7, 41)).toBeUndefined();
  });

  it('reports the row a batch could not deactivate and keeps the rest', async () => {
    const { service, userRepo } = await buildService(null);
    userRepo.findOne.mockImplementation(
      ({ where }: { where: { id: number } }) =>
        Promise.resolve(
          where.id === 404 ? null : ({ id: where.id, isActive: true } as User),
        ),
    );

    await expect(service.bulkDeactivate([7, 404, 1], 1)).resolves.toEqual({
      deleted: [7],
      failed: [
        { id: 404, message: 'User not found' },
        { id: 1, message: 'You cannot deactivate your own account' },
      ],
    });
  });

  it('refuses an administrator deactivating their own account', async () => {
    const { service, userRepo } = await buildService({ id: 1, isActive: true });

    await expect(service.setActive(1, { isActive: false }, 1)).rejects.toThrow(
      'You cannot deactivate your own account',
    );
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('frees the identity and drops the sessions of a deleted account', async () => {
    // A deleted account must not keep a usable session, and both unique indexes cover live
    // rows only, so the username and email return to circulation with the row.
    const { service, userRepo, userRoleRepo } = await buildService({
      id: 7,
      isActive: true,
      refreshToken: 'stored-hash',
    });

    await expect(service.remove(7, 1)).resolves.toEqual({ id: 7 });

    const [saved] = userRepo.save.mock.calls[0] as [User];
    expect(saved.isActive).toBe(false);
    expect(saved.refreshToken).toBeNull();
    expect(saved.isDeleted).toBe(true);
    expect(saved.deletedBy).toBe(1);
    expect(userRoleRepo.delete).toHaveBeenCalledWith({ userId: 7 });
    expect(userRepo.softRemove).toHaveBeenCalled();
  });

  it('refuses an administrator deleting their own account', async () => {
    const { service, userRepo } = await buildService({ id: 1, isActive: true });

    await expect(service.remove(1, 1)).rejects.toThrow(
      'You cannot delete your own account',
    );
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('reports the row a batch could not delete and keeps the rest', async () => {
    const { service, userRepo } = await buildService(null);
    userRepo.findOne.mockImplementation(
      ({ where }: { where: { id: number } }) =>
        Promise.resolve(
          where.id === 404 ? null : ({ id: where.id, isActive: true } as User),
        ),
    );

    await expect(service.removeMany([7, 404, 1], 1)).resolves.toEqual({
      deleted: [7],
      failed: [
        { id: 404, message: 'User not found' },
        { id: 1, message: 'You cannot delete your own account' },
      ],
    });
  });
});

describe('UsersService image links', () => {
  it('hands the list signed links for a stored avatar and signature, not storage keys', async () => {
    const { service } = await buildService({
      id: 7,
      username: 'kho',
      avatarUrl: 'avatars/kho.jpg',
      signatureUrl: 'signatures/kho.png',
    });

    const user = await service.findOne(7);

    expect(user.avatarUrl).toBe(
      'https://files.example.com/avatars/kho.jpg?signed',
    );
    expect(user.signatureUrl).toBe(
      'https://files.example.com/signatures/kho.png?signed',
    );
  });

  it('passes an external picture through and leaves a missing one empty', async () => {
    const external = await buildService({
      id: 8,
      avatarUrl: 'https://cdn.example.com/me.png',
    });
    const none = await buildService({ id: 9, avatarUrl: null });

    expect((await external.service.findOne(8)).avatarUrl).toBe(
      'https://cdn.example.com/me.png',
    );
    expect((await none.service.findOne(9)).avatarUrl).toBeNull();
  });
});

describe('UsersService.createRecord', () => {
  it('runs every check and write on the transaction manager it is given', async () => {
    const { service, userRepo, roleRepo, userRoleRepo } =
      await buildService(null);
    const txUser = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((entity: Partial<User>) => entity),
      save: jest.fn((entity: Partial<User>) =>
        Promise.resolve({ ...entity, id: 9 }),
      ),
    };
    const txRole = {
      findOne: jest.fn().mockResolvedValue({ id: 3, code: 'planner' }),
    };
    const txUserRole = {
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      create: jest.fn((entity: Partial<UserRole>) => entity),
      save: jest.fn((entity: Partial<UserRole>) => Promise.resolve(entity)),
    };
    const manager = {
      getRepository: (entity: unknown) =>
        new Map<unknown, unknown>([
          [User, txUser],
          [Role, txRole],
        ]).get(entity) ?? txUserRole,
    };

    const saved = await service.createRecord(
      {
        username: 'planner',
        email: 'planner@erp.vn',
        fullName: 'Planner',
        roleCode: 'planner',
      },
      1,
      manager as never,
    );

    expect(saved.id).toBe(9);
    expect(txUser.findOne).toHaveBeenCalledTimes(2);
    expect(txUserRole.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9, roleId: 3, assignedBy: 1 }),
    );
    // Nothing touched the repositories bound outside the transaction.
    expect(userRepo.findOne).not.toHaveBeenCalled();
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(roleRepo.findOne).not.toHaveBeenCalled();
    expect(userRoleRepo.save).not.toHaveBeenCalled();
    // No password in the payload: the stored hash is a random unusable one.
    const [created] = txUser.create.mock.calls[0] as [{ passwordHash: string }];
    expect(created.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});
