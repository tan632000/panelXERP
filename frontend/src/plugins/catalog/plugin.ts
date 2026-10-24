import {
  buildNavigationFromFeatures,
  resolveFeaturesForPlugin,
} from "@/kernel/platform/features/feature-navigation.utils";

import { CATALOG_FRONTEND_FEATURES } from "@plugins/catalog/catalog.features";

import type { ErpFrontendPlugin } from "@/kernel/platform/plugins/plugin.contract";

export const catalogFrontendPlugin = {
  key: "catalog",
  name: "Catalog",
  navigationModuleKey: "catalog",
  navigation: buildNavigationFromFeatures(
    resolveFeaturesForPlugin(CATALOG_FRONTEND_FEATURES),
  ),
} satisfies ErpFrontendPlugin;
