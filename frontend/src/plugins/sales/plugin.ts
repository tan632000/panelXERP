import {
  buildNavigationFromFeatures,
  resolveFeaturesForPlugin,
} from "@/kernel/platform/features/feature-navigation.utils";

import { SALES_FRONTEND_FEATURES } from "@plugins/sales/sales.features";

import type { ErpFrontendPlugin } from "@/kernel/platform/plugins/plugin.contract";

export const salesFrontendPlugin = {
  key: "sales",
  name: "Sales",
  navigationModuleKey: "sales",
  navigation: buildNavigationFromFeatures(
    resolveFeaturesForPlugin(SALES_FRONTEND_FEATURES),
  ),
} satisfies ErpFrontendPlugin;
