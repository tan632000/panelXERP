/**
 * Permission matching used by the global roles guard and by any service that has to make
 * the same decision outside a route boundary.
 *
 * A required permission matches when the actor holds it exactly, holds the module
 * wildcard, holds the action wildcard, or holds the full wildcard. The module and action
 * are the first two colon-separated segments, so `*:write` still covers a three-segment
 * scope such as `product:write:general`. Keeping one implementation means an
 * authorization rule cannot drift between the guard and a service.
 */
export function matchesPermission(
  permissions: readonly string[],
  required: string,
): boolean {
  if (permissions.includes('*:*')) return true;

  const [module, action] = required.split(':');

  return (
    permissions.includes(required) ||
    permissions.includes(`${module}:*`) ||
    (Boolean(action) && permissions.includes(`*:${action}`))
  );
}
