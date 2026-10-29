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
  'storekeeper',
];

/**
 * Modules the matrix grants before their plugin declares them, with the task that declares
 * each. A plugin task removes its modules here when it registers its permissions, so the list
 * is empty once its feature is built; until then `seedRoles` stores none of these scopes.
 */
const PENDING_MODULES: Readonly<Record<string, string>> = {
  stock_issue: 'task-12',
  stock_return: 'task-12',
  stocktake: 'task-14',
  purchase_request: 'task-15',
};

/**
 * Scopes of a module whose plugin is declared but not yet complete, with the task that
 * declares each. Empty while every declared module is complete; a task that adds a module in
 * stages lists the scopes of the later stages here until it declares them.
 */
const PENDING_SCOPES: Readonly<Record<string, string>> = {};

/**
 * Seeded scopes no plugin declares and nothing excuses: not a pending scope, not on a
 * pending module. A typo such as `quotation:aprove` lands here.
 */
function strayScopes(
  seeded: Array<[string, string[]]>,
  pendingScopes: Readonly<Record<string, string>> = PENDING_SCOPES,
  pendingModules: Readonly<Record<string, string>> = PENDING_MODULES,
): string[] {
  return seeded.flatMap(([role, scopes]) =>
    scopes
      .filter(
        (scope) =>
          !(scope in pendingScopes) && !(moduleOf(scope) in pendingModules),
      )
      .map((scope) => `${role}: ${scope}`),
  );
}

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

  it('lets sales convert and edit its orders but only managers cancel them', () => {
    const sales = grantsOf('sales');
    for (const action of ['read', 'create', 'update']) {
      expect(holds(sales, `order:${action}`)).toBe(true);
    }
    expect(holds(sales, 'order:cancel')).toBe(false);
    const cancellers = PANEL_ROLES.filter((role) =>
      holds(grantsOf(role), 'order:cancel'),
    );
    expect(cancellers).toEqual(['admin', 'director', 'salesManager']);
  });

  it('lets the engineering lead write estimates, and the director only read them', () => {
    const lead = grantsOf('engineeringLead');
    const director = grantsOf('director');
    for (const action of ['read', 'create', 'update', 'submit']) {
      expect(holds(lead, `estimate:${action}`)).toBe(true);
    }
    expect(holds(director, 'estimate:read')).toBe(true);
    for (const action of ['create', 'update', 'submit']) {
      expect(holds(director, `estimate:${action}`)).toBe(false);
    }
    // The rest of the director's business grants are unchanged.
    expect(holds(director, 'quotation:approve')).toBe(true);
    expect(holds(director, 'order:create')).toBe(true);
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
  it('grants an undeclared scope only while its scope or module is still pending', () => {
    expect(
      strayScopes(unrecognizedRolePermissions(declaredPermissions())),
    ).toEqual([]);
  });

  it('flags a typo in a scope of a declared module, from a local fixture matrix', () => {
    const fixture: Array<[string, string[]]> = [
      ['salesManager', ['quotation:aprove', 'quotation:submit']],
      ['sales', ['order:read', 'quotation:submit']],
    ];
    const pending = { 'quotation:submit': 'a later task' };
    const pendingModules = { order: 'a later task' };

    expect(strayScopes(fixture, pending, pendingModules)).toEqual([
      'salesManager: quotation:aprove',
    ]);
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

  it('drops a scope from the pending list once its plugin declares it', () => {
    const declared = new Set(declaredPermissions());
    const stale = Object.keys(PENDING_SCOPES).filter((scope) =>
      declared.has(scope),
    );
    expect(stale).toEqual([]);
  });

  it('lists only scopes some seeded role actually grants as pending', () => {
    // A scope dropped from the matrix must leave the pending list too, or it lingers unseen.
    const seeded = new Set(PANEL_ROLES.flatMap((role) => [...grantsOf(role)]));
    const orphaned = Object.keys(PENDING_SCOPES).filter(
      (scope) => !seeded.has(scope),
    );
    expect(orphaned).toEqual([]);
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
