import { holds } from '@kernel/core/database/seeds/permission-scope-conversion';
import {
  seededRoleCodes,
  seededRolePermissions,
  unrecognizedRolePermissions,
} from '@kernel/core/database/seeds/seed-roles';
import { DEMO_USER_SPECS } from '@kernel/core/database/seeds/seed-users';
import { filePermissions } from '@kernel/core/files/permissions/file.permissions';
import { userPermissions } from '@kernel/core/users/constants/user-permission.constant';
import { getAllPluginPermissions } from '@kernel/platform/plugins/enabled-plugins';

import { ROLE_DATA_SCOPES } from '@shared/services/data-scope.service';

const PANEL_ROLES = [
  'admin',
  'director',
  'salesManager',
  'sales',
  'engineeringLead',
  'engineer',
  'purchasing',
];

/**
 * Modules the matrix grants before their plugin declares them, with the task that declares
 * each. A plugin task removes its modules here when it registers its permissions, so the list
 * is empty once P1 is built; until then `seedRoles` stores none of these scopes.
 */
const PENDING_MODULES: Readonly<Record<string, string>> = {
  customer: 'task-04',
  contact: 'task-04',
  project: 'task-05',
  item: 'task-06',
  request: 'task-07',
  estimate: 'task-08',
  quotation: 'task-09',
  order: 'task-11',
};

const declaredPermissions = (): string[] => [
  ...getAllPluginPermissions(),
  ...filePermissions,
  ...userPermissions,
];

const moduleOf = (scope: string) => scope.split(':')[0];

/** The permission set of one seeded role, as the guard would read it. */
function grantsOf(roleCode: string): Set<string> {
  const permissions = seededRolePermissions(roleCode);
  if (!permissions) throw new Error(`Role ${roleCode} is not seeded`);
  return new Set(permissions);
}

describe('panel-shop role matrix', () => {
  it('seeds exactly the panel-shop roles, in order', () => {
    expect(seededRoleCodes()).toEqual(PANEL_ROLES);
  });

  it('gives the administrator full access', () => {
    expect([...grantsOf('admin')]).toEqual(['*:*']);
    expect(holds(grantsOf('admin'), 'quotation:approve')).toBe(true);
    expect(holds(grantsOf('admin'), 'file:write')).toBe(true);
  });

  it('lets only the sales manager and the director approve a quotation', () => {
    const approvers = PANEL_ROLES.filter((role) =>
      holds(grantsOf(role), 'quotation:approve'),
    );
    expect(approvers).toEqual(['admin', 'director', 'salesManager']);
  });

  it('keeps sales from approving, even through an action wildcard', () => {
    const sales = grantsOf('sales');
    expect(holds(sales, 'quotation:approve')).toBe(false);
    // `holds` resolves `*:approve`; the seed must not carry one for sales.
    expect(sales.has('*:approve')).toBe(false);
    expect(holds(sales, 'quotation:create')).toBe(true);
  });

  it('keeps engineers out of orders and quotations', () => {
    for (const role of ['engineer', 'engineeringLead']) {
      expect(holds(grantsOf(role), 'order:create')).toBe(false);
      expect(holds(grantsOf(role), 'quotation:create')).toBe(false);
    }
    expect(holds(grantsOf('engineer'), 'estimate:submit')).toBe(true);
    expect(holds(grantsOf('engineeringLead'), 'request:assign')).toBe(true);
  });

  it('grants kernel file routes to the administrator alone', () => {
    const holders = PANEL_ROLES.filter(
      (role) =>
        holds(grantsOf(role), 'file:read') ||
        holds(grantsOf(role), 'file:write'),
    );
    expect(holders).toEqual(['admin']);
  });

  it('lets purchasing and the engineering lead maintain items, sales only read them', () => {
    expect(holds(grantsOf('purchasing'), 'item:create')).toBe(true);
    expect(holds(grantsOf('engineeringLead'), 'item:update')).toBe(true);
    expect(holds(grantsOf('sales'), 'item:read')).toBe(true);
    expect(holds(grantsOf('sales'), 'item:create')).toBe(false);
  });

  it('writes every scope as module:action', () => {
    for (const role of PANEL_ROLES) {
      for (const permission of grantsOf(role)) {
        expect(permission).toMatch(
          /^(\*|[a-z][a-zA-Z_]*):(\*|[a-z][a-zA-Z_]*)$/,
        );
      }
    }
  });

  // `seedRoles` silently drops a scope no plugin declares, and keeps any `module:*`; a typo in
  // either would surface only as a runtime 403. Each must belong to a module still pending.
  it('grants an undeclared scope only on a module whose plugin is still pending', () => {
    const stray = unrecognizedRolePermissions(declaredPermissions()).flatMap(
      ([role, scopes]) =>
        scopes
          .filter((scope) => !(moduleOf(scope) in PENDING_MODULES))
          .map((scope) => `${role}: ${scope}`),
    );
    expect(stray).toEqual([]);
  });

  it('grants a module wildcard only on a declared or pending module', () => {
    const declaredModules = new Set(declaredPermissions().map(moduleOf));
    const stray = PANEL_ROLES.flatMap((role) =>
      [...grantsOf(role)]
        .filter((scope) => scope.endsWith(':*') && scope !== '*:*')
        .filter(
          (scope) =>
            !declaredModules.has(moduleOf(scope)) &&
            !(moduleOf(scope) in PENDING_MODULES),
        )
        .map((scope) => `${role}: ${scope}`),
    );
    expect(stray).toEqual([]);
  });

  it('drops a module from the pending list once its plugin declares it', () => {
    const declaredModules = new Set(declaredPermissions().map(moduleOf));
    const stale = Object.keys(PENDING_MODULES).filter((module) =>
      declaredModules.has(module),
    );
    expect(stale).toEqual([]);
  });

  it('does not let engineers read customers directly (they reach them through a request)', () => {
    for (const scope of ['customer:read', 'contact:read', 'project:read']) {
      expect(holds(grantsOf('engineer'), scope)).toBe(false);
    }
  });

  it('assigns a data scope to every seeded role', () => {
    expect(Object.keys(ROLE_DATA_SCOPES).sort()).toEqual(
      [...PANEL_ROLES].sort(),
    );
  });

  it('seeds demo accounts only on seeded roles, two of each owner-scoped role', () => {
    const roles = DEMO_USER_SPECS.map((spec) => spec.roleCode);
    for (const role of roles) expect(PANEL_ROLES).toContain(role);
    expect(roles.filter((role) => role === 'sales')).toHaveLength(2);
    expect(roles.filter((role) => role === 'engineer')).toHaveLength(2);
  });
});
