import {
  EXAMPLE_ADMIN_PASSWORD,
  resolveAdminPassword,
  seedUsers,
  seedUserSpecsFor,
  type SeedUserSpec,
} from '@kernel/core/database/seeds/seed-users';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';

import type { SeedContext } from '@kernel/core/database/seeds/helpers/seed-context';
import type { Role } from '@kernel/core/users/entities/role.entity';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));

const TEST_PASSWORD = 'unit-test-admin-password';

const DEMO_SALES: SeedUserSpec = {
  username: 'demo_sales',
  emailLocal: 'demo.sales',
  fullName: 'Demo Sales',
  roleCode: 'admin',
  department: 'sales',
  title: 'Sales',
};

describe('seedUsers', () => {
  const userRepo = { findOne: jest.fn(), save: jest.fn(), update: jest.fn() };
  const manager = {
    create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({
      ...data,
    })),
    save: jest.fn((row: Record<string, unknown>) =>
      Promise.resolve({ id: 100, ...row }),
    ),
  };
  const dataSource = {
    getRepository: jest.fn(() => userRepo),
    transaction: jest.fn((run: (m: typeof manager) => unknown) => run(manager)),
  };
  const ctx = { dataSource } as unknown as SeedContext;
  const rolesByCode = new Map<string, Role>([
    ['admin', { id: 1, code: 'admin' } as Role],
  ]);
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SEED_ADMIN_PASSWORD: TEST_PASSWORD,
    };
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  // A live server's accounts belong to its operators: a re-run must not reset any of them.
  it('leaves an existing account untouched', async () => {
    userRepo.findOne.mockResolvedValue({ id: 7, username: 'admin' });

    await seedUsers(ctx, rolesByCode, []);

    expect(userRepo.update).not.toHaveBeenCalled();
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('creates the admin with the admin role in one transaction', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await seedUsers(ctx, rolesByCode, []);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.create).toHaveBeenCalledWith(
      User,
      expect.objectContaining({ username: 'admin', passwordHash: 'hashed' }),
    );
    expect(manager.create).toHaveBeenCalledWith(UserRole, {
      userId: 100,
      roleId: 1,
    });
  });

  it('never writes the password to the log', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await seedUsers(ctx, rolesByCode, [DEMO_SALES]);

    const calls = [
      ...(console.log as jest.Mock<void, unknown[]>).mock.calls,
      ...(console.warn as jest.Mock<void, unknown[]>).mock.calls,
    ];
    const logged = calls.flat().map(String).join('\n');
    expect(logged).toContain('admin');
    expect(logged).not.toContain(TEST_PASSWORD);
  });

  it('fails instead of skipping when a seeded role is missing', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(seedUsers(ctx, new Map(), [])).rejects.toThrow(
      'Role not found: admin',
    );
  });

  it('creates demo accounts outside production only', async () => {
    expect(
      seedUserSpecsFor('development', [DEMO_SALES]).map((s) => s.username),
    ).toEqual(['admin', 'demo_sales']);
    expect(
      seedUserSpecsFor('production', [DEMO_SALES]).map((s) => s.username),
    ).toEqual(['admin']);

    process.env.NODE_ENV = 'production';
    process.env.SEED_ADMIN_PASSWORD = 'a-long-production-only-secret';
    userRepo.findOne.mockResolvedValue(null);

    await seedUsers(ctx, rolesByCode, [DEMO_SALES]);

    const usernames = manager.create.mock.calls
      .filter(([entity]) => entity === User)
      .map(([, data]) => (data as { username: string }).username);
    expect(usernames).toEqual(['admin']);
  });
});

describe('resolveAdminPassword', () => {
  it('requires SEED_ADMIN_PASSWORD in every environment', () => {
    expect(() => resolveAdminPassword({ NODE_ENV: 'development' })).toThrow(
      'SEED_ADMIN_PASSWORD must be set',
    );
    expect(() => resolveAdminPassword({ NODE_ENV: 'production' })).toThrow(
      'SEED_ADMIN_PASSWORD must be set',
    );
  });

  it('refuses the example value or a short value in production', () => {
    expect(() =>
      resolveAdminPassword({
        NODE_ENV: 'production',
        SEED_ADMIN_PASSWORD: EXAMPLE_ADMIN_PASSWORD,
      }),
    ).toThrow('must not be the example value');
    expect(() =>
      resolveAdminPassword({
        NODE_ENV: 'production',
        SEED_ADMIN_PASSWORD: 'short',
      }),
    ).toThrow('at least 12 characters');
    expect(() =>
      resolveAdminPassword({
        NODE_ENV: 'production',
        SEED_ADMIN_PASSWORD: 'CHANGE_ME_long_enough_value',
      }),
    ).toThrow('must not be the example value');
  });

  it('keeps surrounding whitespace instead of trimming the password', () => {
    expect(
      resolveAdminPassword({
        NODE_ENV: 'development',
        SEED_ADMIN_PASSWORD: ' padded-password ',
      }),
    ).toBe(' padded-password ');
  });

  it('accepts the example value outside production', () => {
    expect(
      resolveAdminPassword({
        NODE_ENV: 'development',
        SEED_ADMIN_PASSWORD: EXAMPLE_ADMIN_PASSWORD,
      }),
    ).toBe(EXAMPLE_ADMIN_PASSWORD);
  });
});
