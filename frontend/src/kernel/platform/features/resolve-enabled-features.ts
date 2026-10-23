/** Legacy ENABLED_FEATURES keys mapped to current feature keys. */
const FEATURE_KEY_ALIASES: Record<string, string> = {
  "sales-order": "order",
};

function normalizeFeatureKey(key: string): string {
  return FEATURE_KEY_ALIASES[key] ?? key;
}

export function parseEnabledFeatureKeys(
  envValue: string | undefined,
  fallbackKeys: readonly string[],
): string[] {
  const trimmed = envValue?.trim();
  if (!trimmed) {
    return [...fallbackKeys];
  }
  const keys = trimmed
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
    .map(normalizeFeatureKey);
  return [...new Set(keys)];
}

export function filterFeaturesByKey<T extends { key: string }>(
  catalog: readonly T[],
  enabledKeys: readonly string[],
): T[] {
  const catalogByKey = new Map(
    catalog.map((feature) => [feature.key, feature]),
  );

  const unknown = enabledKeys.filter((key) => !catalogByKey.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown frontend feature(s): ${unknown.join(", ")}. Available: ${[...catalogByKey.keys()].join(", ")}`,
    );
  }

  const enabledSet = new Set(enabledKeys);
  return catalog.filter((feature) => enabledSet.has(feature.key));
}

export function validateFeatureDependencies<
  T extends { key: string; dependsOn?: readonly string[] },
>(features: T[]): void {
  const enabledKeys = new Set(features.map((feature) => feature.key));

  for (const feature of features) {
    for (const dep of feature.dependsOn ?? []) {
      if (!enabledKeys.has(dep)) {
        throw new Error(
          `Feature "${feature.key}" depends on "${dep}" which is not enabled`,
        );
      }
    }
  }
}
