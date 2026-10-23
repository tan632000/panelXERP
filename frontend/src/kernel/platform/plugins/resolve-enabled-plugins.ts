/**
 * Filter frontend plugin catalog by NEXT_PUBLIC_ENABLED_PLUGINS env.
 * Direct process.env reference required for Next.js client inlining.
 */
export function parseEnabledPluginKeys(
  envValue: string | undefined,
  fallbackKeys: readonly string[],
): string[] {
  const trimmed = envValue?.trim();
  if (!trimmed) {
    return [...fallbackKeys];
  }
  return trimmed
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

export function filterFrontendPluginsByKey<T extends { key: string }>(
  catalog: readonly T[],
  enabledKeys: readonly string[],
): T[] {
  const catalogByKey = new Map(catalog.map((plugin) => [plugin.key, plugin]));

  const unknown = enabledKeys.filter((key) => !catalogByKey.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown frontend plugin(s): ${unknown.join(", ")}. Available: ${[...catalogByKey.keys()].join(", ")}`,
    );
  }

  const enabledSet = new Set(enabledKeys);
  return catalog.filter((plugin) => enabledSet.has(plugin.key));
}
