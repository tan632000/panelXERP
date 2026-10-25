import { filePermissions } from '@kernel/core/files/permissions/file.permissions';
import { userPermissions } from '@kernel/core/users/constants/user-permission.constant';
import { Role } from '@kernel/core/users/entities/role.entity';
import { getAllPluginPermissions } from '@kernel/platform/plugins/enabled-plugins';

import type { SeedContext } from '@kernel/core/database/seeds/helpers/seed-context';

/**
 * Sales-chain scopes per module, `module:action`. A plugin declares the same keys in its own
 * `*.permissions.ts`; until it does, `seedRoles` reports them and leaves them out of the stored set.
 */
const CUSTOMER_READ = ['customer:read', 'contact:read', 'project:read'];
const CUSTOMER_WRITE = [
  ...CUSTOMER_READ,
  'customer:create',
  'customer:update',
  'contact:create',
  'contact:update',
  'project:create',
  'project:update',
];
const CUSTOMER_ALL = ['customer:*', 'contact:*', 'project:*'];
const ITEM_ALL = ['item:*'];
const REQUEST_SALES = [
  'request:read',
  'request:create',
  'request:update',
  'request:assign',
  'request:cancel',
];
const ESTIMATE_WRITE = [
  'estimate:read',
  'estimate:create',
  'estimate:update',
  'estimate:submit',
];
const QUOTATION_SALES = [
  'quotation:read',
  'quotation:create',
  'quotation:update',
  'quotation:submit',
  'quotation:confirm',
  'quotation:cancel',
  'quotation:export',
];
const ORDER_SALES = ['order:read', 'order:create'];

/** Every sales-chain module, granted whole to the roles that run the business. */
const SALES_CHAIN_ALL = [
  ...CUSTOMER_ALL,
  ...ITEM_ALL,
  'request:*',
  'estimate:*',
  'quotation:*',
  'order:*',
];

/** The director reads every estimate but never writes one: that is the engineers' work. */
const DIRECTOR_GRANTS = SALES_CHAIN_ALL.map((scope) =>
  scope === 'estimate:*' ? 'estimate:read' : scope,
);

/**
 * [name, code, description, permissions] in seed order (D-11, D-12). Kernel file routes
 * (`file:read`, `file:write`) sign any stored key, so only the administrator holds them;
 * business attachments go through their feature's own endpoints.
 */
const ROLES: ReadonlyArray<
  readonly [string, string, string, readonly string[]]
> = [
  ['Administrator', 'admin', 'Full system access', ['*:*']],
  [
    'Director',
    'director',
    'Runs the business: every sales-chain module, quotation approval included; reads estimates but does not write them',
    DIRECTOR_GRANTS,
  ],
  [
    'Sales Manager',
    'salesManager',
    'Manages sales: all customers and requests, approves quotations',
    [
      ...CUSTOMER_ALL,
      'item:read',
      'request:*',
      'estimate:read',
      'quotation:*',
      'order:*',
    ],
  ],
  [
    'Sales',
    'sales',
    'Handles own customers, requests, quotations and orders',
    [
      ...CUSTOMER_WRITE,
      'item:read',
      ...REQUEST_SALES,
      'estimate:read',
      ...QUOTATION_SALES,
      ...ORDER_SALES,
    ],
  ],
  [
    'Engineering Lead',
    'engineeringLead',
    'Leads engineering: assigns requests, edits every estimate, maintains items',
    [
      ...CUSTOMER_READ,
      ...ITEM_ALL,
      'request:read',
      'request:assign',
      'estimate:*',
    ],
  ],
  [
    'Engineer',
    'engineer',
    'Builds the BOM and estimate of the requests assigned to them',
    // No direct customer/project read: the engineer's scope is the requests assigned to
    // them, and a request shows its customer and project summary itself.
    ['item:read', 'request:read', ...ESTIMATE_WRITE],
  ],
  [
    'Purchasing',
    'purchasing',
    'Maintains the item catalog and its reference purchase prices',
    ITEM_ALL,
  ],
];

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
