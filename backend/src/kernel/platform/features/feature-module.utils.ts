import {
  filterFeaturesByKey,
  parseEnabledFeatureKeys,
  validateFeatureDependencies,
} from '@kernel/platform/features/resolve-enabled-features';

import type { ErpFeature } from '@kernel/platform/features/feature.contract';
import type { Type } from '@nestjs/common';

/** Resolve Nest modules for one plugin from its feature catalog + ENABLED_FEATURES */
export function getFeatureModulesForPlugin(
  catalog: readonly ErpFeature[],
): Array<Type<unknown>> {
  const defaultKeys = catalog.map((feature) => feature.key);
  const enabledKeys = parseEnabledFeatureKeys(
    process.env.ENABLED_FEATURES,
    defaultKeys,
  );
  const features = filterFeaturesByKey(catalog, enabledKeys);
  validateFeatureDependencies(features);

  return features
    .map((feature) => feature.module)
    .filter((module): module is Type<unknown> => module !== undefined);
}

/** Run seeds for enabled features in a plugin catalog */
export async function runFeatureSeeds(
  catalog: readonly ErpFeature[],
  dataSource: import('typeorm').DataSource,
): Promise<void> {
  const defaultKeys = catalog.map((feature) => feature.key);
  const enabledKeys = parseEnabledFeatureKeys(
    process.env.ENABLED_FEATURES,
    defaultKeys,
  );
  const features = filterFeaturesByKey(catalog, enabledKeys);

  for (const feature of features) {
    if (feature.seed) {
      await feature.seed(dataSource);
    }
  }
}

export function getFeaturePermissions(
  catalog: readonly ErpFeature[],
): string[] {
  const defaultKeys = catalog.map((feature) => feature.key);
  const enabledKeys = parseEnabledFeatureKeys(
    process.env.ENABLED_FEATURES,
    defaultKeys,
  );
  const features = filterFeaturesByKey(catalog, enabledKeys);
  return features.flatMap((feature) => feature.permissions ?? []);
}

/**
 * Each enabled feature's scope resource mapped to the role-matrix module it declares, for the
 * features that list their scopes outside their plugin's module.
 */
export function getFeaturePermissionModules(
  catalog: readonly ErpFeature[],
): Record<string, string> {
  const defaultKeys = catalog.map((feature) => feature.key);
  const enabledKeys = parseEnabledFeatureKeys(
    process.env.ENABLED_FEATURES,
    defaultKeys,
  );
  const modules: Record<string, string> = {};
  for (const feature of filterFeaturesByKey(catalog, enabledKeys)) {
    if (!feature.permissionModule) continue;
    for (const permission of feature.permissions ?? []) {
      modules[permission.split(':')[0]] = feature.permissionModule;
    }
  }
  return modules;
}

export function isFeatureKeyEnabled(
  catalog: readonly ErpFeature[],
  featureKey: string,
): boolean {
  const defaultKeys = catalog.map((feature) => feature.key);
  const enabledKeys = parseEnabledFeatureKeys(
    process.env.ENABLED_FEATURES,
    defaultKeys,
  );
  return enabledKeys.includes(featureKey);
}
