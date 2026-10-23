import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AuthPrincipalCache } from '@kernel/core/auth/auth-principal-cache.service';
import { RolesService } from '@kernel/core/roles/roles.service';
import { Role } from '@kernel/core/users/entities/role.entity';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { getAllPluginPermissions } from '@kernel/platform/plugins/enabled-plugins';

// The build ships no business plugin yet; one fixture plugin gives the catalog something to
// group, so these cases keep exercising the real catalog and save logic.
jest.mock('@kernel/platform/plugins/enabled-plugins', () => {
  const fixturePlugin = {
    name: 'fixture',
    module: class FixtureModule {},
    permissions: ['fixture:read', 'fixture:write', 'fixture:export'],
  };
  return {
    ENABLED_PLUGINS: [fixturePlugin],
    getAllPluginPermissions: () => fixturePlugin.permissions,
  };
});

async function buildService(role: Partial<Role> | null) {
  const roleRepo = {
    find: jest.fn().mockResolvedValue(role ? [role as Role] : []),
    findOne: jest.fn().mockResolvedValue(role),
    save: jest.fn().mockImplementation((entity: Role) => entity),
  };
  const userRoleRepo = {
    find: jest.fn().mockResolvedValue([{ roleId: 1 }, { roleId: 1 }]),
  };

  const module = await Test.createTestingModule({
    providers: [
      AuthPrincipalCache,
      RolesService,
      { provide: getRepositoryToken(Role), useValue: roleRepo },
      { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
    ],
  }).compile();

  return {
    service: module.get(RolesService),
    roleRepo,
    cache: module.get(AuthPrincipalCache),
  };
}

describe('RolesService', () => {
  it('evicts every cached principal when the permissions of a role change', async () => {
    const { service, cache } = await buildService({
      id: 1,
      code: 'planner',
      name: 'Planner',
      isSystem: false,
      permissions: ['product:read'],
    });
    cache.set(7, 41, {
      userId: 7,
      username: 'planner',
      email: 'p@example.com',
      role: 'planner',
      permissions: ['product:read'],
      sessionId: 41,
    });

    await service.updatePermissions(1, { permissions: [] }, 1);

    expect(cache.get(7, 41)).toBeUndefined();
  });

  it('reports how many accounts hold each role', async () => {
    const { service } = await buildService({
      id: 1,
      code: 'planner',
      name: 'Planner',
      isSystem: false,
      permissions: ['product:read'],
    });

    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({ code: 'planner', userCount: 2 }),
    ]);
  });

  it('groups the catalog by the resource each permission acts on', () => {
    const catalog = buildService(null).then(({ service }) =>
      service.findPermissionCatalog(),
    );

    return catalog.then((groups) => {
      expect(groups.length).toBeGreaterThan(0);
      const flattened = groups.flatMap((group) => group.permissions);
      expect(flattened).toEqual(
        expect.arrayContaining([getAllPluginPermissions()[0]]),
      );
      for (const group of groups) {
        expect(
          group.permissions.every((permission) =>
            permission.startsWith(`${group.resource}:`),
          ),
        ).toBe(true);
      }
    });
  });

  it('leaves attachment plumbing out of the catalog but still accepts it', async () => {
    // `file:read` is borrowed by every module rather than being a function of its own, so it
    // is not offered — yet a role seeded with it must still save without losing it.
    const { service, roleRepo } = await buildService({
      id: 1,
      code: 'sale_staff',
      name: 'Sales Staff',
      isSystem: false,
      permissions: ['file:read'],
    });

    const flattened = service
      .findPermissionCatalog()
      .flatMap((group) => group.permissions);
    expect(flattened).not.toContain('file:read');

    await service.updatePermissions(1, { permissions: ['file:read'] }, 1);
    const [saved] = roleRepo.save.mock.calls[0] as [Role];
    expect(saved.permissions).toEqual(['file:read']);
  });

  it('refuses a permission the build does not define', async () => {
    const { service, roleRepo } = await buildService({
      id: 1,
      code: 'planner',
      permissions: [],
    });

    await expect(
      service.updatePermissions(1, { permissions: ['made:up'] }, 1),
    ).rejects.toThrow('Unknown permission(s): made:up');
    expect(roleRepo.save).not.toHaveBeenCalled();
  });

  it('drops a stale scope the role already held instead of refusing the save', async () => {
    const [kept] = getAllPluginPermissions();
    const { service, roleRepo } = await buildService({
      id: 1,
      code: 'sale_staff',
      permissions: [kept, 'retired:read'],
    });

    await service.updatePermissions(
      1,
      { permissions: [kept, 'retired:read'] },
      1,
    );

    const [saved] = roleRepo.save.mock.calls[0] as [Role];
    expect(saved.permissions).toEqual([kept]);
  });

  it('saves a held module wildcard as the concrete scopes it grants', async () => {
    const { service, roleRepo } = await buildService({
      id: 1,
      code: 'fixture_manager',
      permissions: ['fixture:*'],
    });

    await service.updatePermissions(1, { permissions: ['fixture:*'] }, 1);

    const [saved] = roleRepo.save.mock.calls[0] as [Role];
    const declared = getAllPluginPermissions().filter((p) =>
      p.startsWith('fixture:'),
    );
    expect(declared.length).toBeGreaterThan(0);
    expect(saved.permissions).toEqual([...declared].sort());
  });

  it('leaves the full-access role alone', async () => {
    const { service, roleRepo } = await buildService({
      id: 1,
      code: 'director',
      permissions: ['*:*'],
    });

    await expect(
      service.updatePermissions(1, { permissions: [] }, 1),
    ).rejects.toThrow('cannot have its permissions narrowed');
    expect(roleRepo.save).not.toHaveBeenCalled();
  });

  it('stores the new set sorted', async () => {
    const known = getAllPluginPermissions().slice(0, 2);
    const { service, roleRepo } = await buildService({
      id: 1,
      code: 'planner',
      name: 'Planner',
      isSystem: false,
      permissions: [],
    });

    await service.updatePermissions(
      1,
      { permissions: [...known].reverse() },
      1,
    );

    const [saved] = roleRepo.save.mock.calls[0] as [Role];
    expect(saved.permissions).toEqual([...known].sort());
  });
});
