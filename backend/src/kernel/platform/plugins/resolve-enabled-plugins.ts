/**
 * Filter plugin catalog by ENABLED_PLUGINS env (comma-separated names).
 * Restart process after env change — no rebuild required (code stays in bundle).
 */
export function parseEnabledPluginNames(
  envValue: string | undefined,
  fallbackNames: readonly string[],
): string[] {
  const trimmed = envValue?.trim();
  if (!trimmed) {
    return [...fallbackNames];
  }
  return trimmed
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

export function filterPluginsByName<T extends { name: string }>(
  catalog: readonly T[],
  enabledNames: readonly string[],
): T[] {
  const catalogByName = new Map(catalog.map((plugin) => [plugin.name, plugin]));

  const unknown = enabledNames.filter((name) => !catalogByName.has(name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown plugin(s): ${unknown.join(', ')}. Available: ${[...catalogByName.keys()].join(', ')}`,
    );
  }

  const enabledSet = new Set(enabledNames);
  return catalog.filter((plugin) => enabledSet.has(plugin.name));
}
