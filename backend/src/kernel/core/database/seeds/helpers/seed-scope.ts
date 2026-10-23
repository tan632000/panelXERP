/**
 * Seed scope — how much data one seed run writes.
 *
 *   core → roles/permissions and login accounts only (no screen data)
 *   all  → core plus every plugin/feature data seed
 *
 * SEED_SCOPE wins when set. Otherwise local envs (development/test/local) get
 * `all`; every other env — staging and production included — gets `core`.
 */
export type SeedScope = 'core' | 'all';

/** NODE_ENV values that seed the full dataset when SEED_SCOPE is unset */
const FULL_DATA_ENVS = new Set(['development', 'test', 'local']);

function isSeedScope(value: string): value is SeedScope {
  return value === 'core' || value === 'all';
}

export function parseSeedScope(
  seedScopeEnv: string | undefined,
  nodeEnv: string | undefined,
): SeedScope {
  const explicit = seedScopeEnv?.trim().toLowerCase();
  if (explicit) {
    if (!isSeedScope(explicit)) {
      throw new Error(
        `Invalid SEED_SCOPE "${seedScopeEnv}" — use "core" or "all".`,
      );
    }
    return explicit;
  }

  const env = nodeEnv?.trim().toLowerCase();
  return env && FULL_DATA_ENVS.has(env) ? 'all' : 'core';
}

export function resolveSeedScope(): SeedScope {
  return parseSeedScope(process.env.SEED_SCOPE, process.env.NODE_ENV);
}
