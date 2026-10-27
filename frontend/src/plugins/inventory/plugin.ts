import {
  buildNavigationFromFeatures,
  resolveFeaturesForPlugin,
} from "@/kernel/platform/features/feature-navigation.utils";

import { INVENTORY_FRONTEND_FEATURES } from "@plugins/inventory/inventory.features";

import type { ErpFrontendPlugin } from "@/kernel/platform/plugins/plugin.contract";

export const inventoryFrontendPlugin = {
  key: "inventory",
  name: "Inventory",
  dependsOn: ["catalog", "sales"],
  navigationModuleKey: "inventory",
  navigation: buildNavigationFromFeatures(
    resolveFeaturesForPlugin(INVENTORY_FRONTEND_FEATURES),
  ),
} satisfies ErpFrontendPlugin;
