import { ENABLED_FRONTEND_FEATURE_KEY_SET } from "@kernel/platform/features/enabled-feature-keys";
import { validateFeatureDependencies } from "@kernel/platform/features/resolve-enabled-features";

import type { ErpFrontendFeature } from "@kernel/platform/features/feature.contract";
import type {
  ModuleNavigation,
  SidebarSection,
} from "@kernel/platform/plugins/navigation.types";

export function resolveFeaturesForPlugin(
  catalog: readonly ErpFrontendFeature[],
): ErpFrontendFeature[] {
  const features = catalog.filter((feature) =>
    ENABLED_FRONTEND_FEATURE_KEY_SET.has(feature.key),
  );
  validateFeatureDependencies(features);
  return features;
}

export function buildNavigationFromFeatures(
  features: ErpFrontendFeature[],
): ModuleNavigation {
  const sections: SidebarSection[] = [];

  for (const feature of features) {
    if (feature.items.length === 0) continue;

    const sectionTitle = feature.sectionTitle ?? "sectionMasterData";
    const existing = sections.find((section) => section.title === sectionTitle);

    if (existing) {
      existing.items.push(...feature.items);
    } else {
      sections.push({ title: sectionTitle, items: [...feature.items] });
    }
  }

  return {
    moduleName: "moduleName",
    sections,
  };
}
