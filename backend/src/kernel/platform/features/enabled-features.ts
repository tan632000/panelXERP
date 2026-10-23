import {
  assertKnownFeatureKeys,
  filterFeaturesByKey,
  parseEnabledFeatureKeys,
  validateFeatureDependencies,
} from '@kernel/platform/features/resolve-enabled-features';
import { ENABLED_PLUGINS } from '@kernel/platform/plugins/enabled-plugins';

import { CRM_FEATURES } from '@plugins/crm/crm.features';

import type { ErpFeature } from '@kernel/platform/features/feature.contract';

/**
 * Every feature of every registered plugin, in plugin-registration order.
 *
 * This is what the migration globs and the `ENABLED_FEATURES` allow-list are built from, so a
 * plugin left out here has its migrations silently skipped and its own feature keys rejected
 * as unknown. Add a plugin's `*_FEATURES` here the moment the plugin is registered.
 */
const FEATURE_CATALOG: ErpFeature[] = [...CRM_FEATURES];

function resolveGlobalEnabledFeatures(): ErpFeature[] {
  const pluginNames = new Set(ENABLED_PLUGINS.map((plugin) => plugin.name));
  const forPlugins = FEATURE_CATALOG.filter((feature) =>
    pluginNames.has(feature.plugin),
  );
  const defaultKeys = forPlugins.map((feature) => feature.key);
  const enabledKeys = parseEnabledFeatureKeys(
    process.env.ENABLED_FEATURES,
    defaultKeys,
  );
  assertKnownFeatureKeys(forPlugins, enabledKeys);
  const features = filterFeaturesByKey(forPlugins, enabledKeys);
  validateFeatureDependencies(features);
  return features;
}

let cachedFeatures: ErpFeature[] | null = null;

function getEnabledFeatures(): ErpFeature[] {
  if (!cachedFeatures) {
    cachedFeatures = resolveGlobalEnabledFeatures();
  }
  return cachedFeatures;
}

export function getFeatureMigrationGlobs(sourceRoot: 'src' | 'dist'): string[] {
  const ext = sourceRoot === 'src' ? 'ts' : 'js';
  return getEnabledFeatures().map(
    (feature) =>
      `${sourceRoot}/plugins/${feature.plugin}/${feature.directory ?? feature.key}/database/migrations/*.${ext}`,
  );
}
