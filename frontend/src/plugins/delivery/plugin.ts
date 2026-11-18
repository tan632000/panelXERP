import {
  buildNavigationFromFeatures,
  resolveFeaturesForPlugin,
} from "@/kernel/platform/features/feature-navigation.utils";

import { DELIVERY_FRONTEND_FEATURES } from "@plugins/delivery/delivery.features";

import type { ErpFrontendPlugin } from "@/kernel/platform/plugins/plugin.contract";

export const deliveryFrontendPlugin = {
  key: "delivery",
  name: "Delivery",
  dependsOn: ["sales", "production"],
  navigationModuleKey: "delivery",
  navigation: buildNavigationFromFeatures(
    resolveFeaturesForPlugin(DELIVERY_FRONTEND_FEATURES),
  ),
} satisfies ErpFrontendPlugin;
