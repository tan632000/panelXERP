import {
  filterFeaturesByKey,
  parseEnabledFeatureKeys,
  validateFeatureDependencies,
} from "@kernel/platform/features/resolve-enabled-features";

import { CATALOG_FRONTEND_FEATURES } from "@/plugins/catalog/catalog.features";
import { CRM_FRONTEND_FEATURES } from "@/plugins/crm/crm.features";
import { INVENTORY_FRONTEND_FEATURES } from "@/plugins/inventory/inventory.features";
import { SALES_FRONTEND_FEATURES } from "@/plugins/sales/sales.features";
import { SYSTEM_FRONTEND_FEATURES } from "@/plugins/system/system.features";

import type { ErpFrontendFeature } from "@kernel/platform/features/feature.contract";

/**
 * Full frontend feature catalog across enabled plugins, in plugin-registration order.
 *
 * A plugin left out here is not toggleable through `NEXT_PUBLIC_ENABLED_FEATURES`: its keys
 * are unregistered, so `isFrontendFeatureEnabled` waves them through whatever the env says.
 */
export const FRONTEND_FEATURE_CATALOG: ErpFrontendFeature[] = [
  ...CRM_FRONTEND_FEATURES,
  ...CATALOG_FRONTEND_FEATURES,
  ...SALES_FRONTEND_FEATURES,
  ...INVENTORY_FRONTEND_FEATURES,
  ...SYSTEM_FRONTEND_FEATURES,
];

const CATALOG_KEYS = FRONTEND_FEATURE_CATALOG.map((feature) => feature.key);

const ENABLED_KEYS = (() => {
  const enabledKeys = parseEnabledFeatureKeys(
    process.env.NEXT_PUBLIC_ENABLED_FEATURES ?? process.env.ENABLED_FEATURES,
    CATALOG_KEYS,
  );
  const features = filterFeaturesByKey(FRONTEND_FEATURE_CATALOG, enabledKeys);
  validateFeatureDependencies(features);
  return features.map((feature) => feature.key);
})();

export const ENABLED_FRONTEND_FEATURE_KEY_SET = new Set(ENABLED_KEYS);

export const REGISTERED_FRONTEND_FEATURE_KEY_SET = new Set(CATALOG_KEYS);

export function isFrontendFeatureEnabled(featureKey: string): boolean {
  if (!REGISTERED_FRONTEND_FEATURE_KEY_SET.has(featureKey)) {
    return true;
  }
  return ENABLED_FRONTEND_FEATURE_KEY_SET.has(featureKey);
}
