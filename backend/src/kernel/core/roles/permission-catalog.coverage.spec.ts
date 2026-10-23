import 'reflect-metadata';

import { PERMISSIONS_KEY } from '@kernel/core/auth/decorators/auth.decorators';
import { filePermissions } from '@kernel/core/files/permissions/file.permissions';
import { userPermissions } from '@kernel/core/users/constants/user-permission.constant';
import { getAllPluginPermissions } from '@kernel/platform/plugins/enabled-plugins';

// The root module has no path alias; the scan has to start from it to reach every controller.
// eslint-disable-next-line no-restricted-imports
import { AppModule } from '../../../app.module';

/** A module import entry: a class, a dynamic module or a forward reference. */
type ModuleRef = unknown;

/** Every controller class reachable from a module, through static and dynamic imports. */
function controllersOf(root: unknown): Set<new (...args: never[]) => unknown> {
  const seen = new Set<unknown>();
  const controllers = new Set<new (...args: never[]) => unknown>();

  const visit = (entry: ModuleRef) => {
    if (!entry) return;
    const ref = entry as { module?: unknown; forwardRef?: () => unknown };
    if (typeof ref.forwardRef === 'function') return visit(ref.forwardRef());
    const target = ref.module ?? entry;
    if (seen.has(target)) return;
    seen.add(target);

    const declared = [
      ...((Reflect.getMetadata('controllers', target) as unknown[]) ?? []),
      ...((ref.module
        ? (ref as { controllers?: unknown[] }).controllers
        : []) ?? []),
    ];
    for (const controller of declared) {
      controllers.add(controller as new (...args: never[]) => unknown);
    }
    const imports = [
      ...((Reflect.getMetadata('imports', target) as unknown[]) ?? []),
      ...((ref.module ? (ref as { imports?: unknown[] }).imports : []) ?? []),
    ];
    imports.forEach(visit);
  };

  visit(root);
  return controllers;
}

/** The scopes a route requires, read off the class and every handler on it. */
function requiredScopes(
  controller: new (...args: never[]) => unknown,
): string[] {
  const scopes: string[] = [
    ...((Reflect.getMetadata(PERMISSIONS_KEY, controller) as string[]) ?? []),
  ];
  const proto = controller.prototype as Record<string, unknown>;
  for (const name of Object.getOwnPropertyNames(proto)) {
    const handler = proto[name];
    if (typeof handler !== 'function') continue;
    scopes.push(
      ...((Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[]) ?? []),
    );
  }
  return scopes;
}

/**
 * The role permission matrix offers exactly the scopes the build declares. A route guarded by
 * a scope nobody declared could never be granted from that screen — only the director's
 * wildcard would reach it — so every guarded scope must be declared.
 */
describe('permission catalog coverage', () => {
  it('declares every scope a route requires', () => {
    const declared = new Set([
      ...getAllPluginPermissions(),
      ...filePermissions,
      ...userPermissions,
    ]);
    const undeclared = new Set<string>();
    const controllers = controllersOf(AppModule);
    const guarded = new Set<string>();

    for (const controller of controllers) {
      for (const scope of requiredScopes(controller)) {
        guarded.add(scope);
        if (scope === '*:*' || scope.endsWith(':*')) continue;
        if (!declared.has(scope)) {
          undeclared.add(`${controller.name}: ${scope}`);
        }
      }
    }

    // Guards against a walk that silently found nothing: the kernel's own guarded routes
    // must be reached before plugin controllers are counted.
    const names = new Set(
      [...controllers].map((controller) => controller.name),
    );
    for (const kernelController of [
      'FilesController',
      'RolesController',
      'UsersController',
    ]) {
      expect(names.has(kernelController)).toBe(true);
    }
    expect(guarded.size).toBeGreaterThan(0);
    expect([...undeclared].sort()).toEqual([]);
  });
});
