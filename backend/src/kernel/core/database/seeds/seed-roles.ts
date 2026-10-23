import { filePermissions } from '@kernel/core/files/permissions/file.permissions';
import { userPermissions } from '@kernel/core/users/constants/user-permission.constant';
import { Role } from '@kernel/core/users/entities/role.entity';
import { getAllPluginPermissions } from '@kernel/platform/plugins/enabled-plugins';

import type { SeedContext } from '@kernel/core/database/seeds/helpers/seed-context';

/** [name, code, description, permissions] — feature tasks append their roles and scopes here. */
const ROLES: ReadonlyArray<
  readonly [string, string, string, readonly string[]]
> = [['Administrator', 'admin', 'Full system access', ['*:*']]];

interface SeededRole {
  name: string;
  code: string;
  description: string;
  permissions: string[];
}

/** Every seeded role with its permission set, in seed order. */
function seededRoles(): SeededRole[] {
  return ROLES.map(([name, code, description, permissions]) => ({
    name,
    code,
    description,
    permissions: [...permissions],
  }));
}

/** Permissions granted to one seeded role, or undefined when the code is unknown. */
export function seededRolePermissions(roleCode: string): string[] | undefined {
  return seededRoles().find((role) => role.code === roleCode)?.permissions;
}

/** Every seeded role code, in seed order. */
export function seededRoleCodes(): string[] {
  return seededRoles().map((role) => role.code);
}

/**
 * Seeded permissions that the plugin registry does not declare, per role.
 * Wildcards are exempt because they are resolved by the guard, not the registry.
 */
export function unrecognizedRolePermissions(
  knownPermissions: string[],
): Array<[string, string[]]> {
  const knownSet = new Set(knownPermissions);
  const perRole: Array<[string, string[]]> = [];

  for (const { code, permissions } of seededRoles()) {
    const unrecognized = permissions.filter(
      (p) => p !== '*:*' && !p.endsWith(':*') && !knownSet.has(p),
    );
    if (unrecognized.length > 0) {
      perRole.push([code, unrecognized]);
    }
  }

  return perRole;
}

function validatePermissions(knownPermissions: string[]): void {
  const perRole = unrecognizedRolePermissions(knownPermissions);

  if (perRole.length > 0) {
    console.warn(
      '[seed-roles] WARNING: unrecognized seed permissions are not declared by the plugin registry:',
    );
    for (const [role, perms] of perRole) {
      console.warn(`  - ${role}: ${perms.join(', ')}`);
    }
    console.warn(
      '[seed-roles] These permissions may belong to a disabled plugin or be typos.',
    );
  }
}

export async function seedRoles(ctx: SeedContext): Promise<Map<string, Role>> {
  const repo = ctx.dataSource.getRepository(Role);
  const rolesByCode = new Map<string, Role>();

  const knownPermissions = [
    ...getAllPluginPermissions(),
    ...filePermissions,
    ...userPermissions,
  ];
  validatePermissions(knownPermissions);

  // A scope no guard reads is reported above and left out of the stored set: the permission
  // matrix lists only declared scopes, so a stray one would be dropped silently by the next
  // save from that screen.
  const known = new Set(knownPermissions);
  const preserved: string[] = [];
  for (const seeded of seededRoles()) {
    const { name, code, description } = seeded;
    const permissions = seeded.permissions.filter(
      (p) => p === '*:*' || p.endsWith(':*') || known.has(p),
    );
    let role = await repo.findOne({ where: { code } });
    if (!role) {
      role = repo.create({ name, code, description, permissions });
    } else {
      role.name = name;
      role.description = description;
      // A role an administrator saved from the permission matrix carries `updatedBy`, and
      // that set is the customer's decision: re-seeding keeps it.
      if (role.updatedBy == null) {
        role.permissions = permissions;
      } else {
        preserved.push(code);
      }
    }
    rolesByCode.set(code, await repo.save(role));
  }

  if (preserved.length > 0) {
    console.log(
      `[seed-roles] Kept the administrator-edited permissions of: ${preserved.join(', ')}`,
    );
  }

  return rolesByCode;
}
