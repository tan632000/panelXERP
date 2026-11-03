import {
  buildNavigationFromFeatures,
  resolveFeaturesForPlugin,
} from "@/kernel/platform/features/feature-navigation.utils";

import { PRODUCTION_FRONTEND_FEATURES } from "@plugins/production/production.features";

import type { ErpFrontendPlugin } from "@/kernel/platform/plugins/plugin.contract";

export const productionFrontendPlugin = {
  key: "production",
  name: "Production",
  dependsOn: ["catalog", "sales", "inventory"],
  navigationModuleKey: "production",
  navigation: buildNavigationFromFeatures(
    resolveFeaturesForPlugin(PRODUCTION_FRONTEND_FEATURES),
  ),
} satisfies ErpFrontendPlugin;
