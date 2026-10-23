export const FULL_ACCESS = '*:*';

/** Same decision as `matchesPermission`: exact, `<module>:*`, `*:<action>` or `*:*`. */
export function holds(
  permissions: ReadonlySet<string>,
  scope: string,
): boolean {
  if (permissions.has(scope) || permissions.has(FULL_ACCESS)) return true;
  const [module, action] = scope.split(':');
  return (
    permissions.has(`${module}:*`) ||
    (Boolean(action) && permissions.has(`*:${action}`))
  );
}
