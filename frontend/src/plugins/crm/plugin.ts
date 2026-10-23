import {
  buildNavigationFromFeatures,
  resolveFeaturesForPlugin,
} from "@/kernel/platform/features/feature-navigation.utils";

import { CRM_FRONTEND_FEATURES } from "@plugins/crm/crm.features";

import type { ErpFrontendPlugin } from "@/kernel/platform/plugins/plugin.contract";

export const crmFrontendPlugin = {
  key: "crm",
  name: "CRM",
  navigationModuleKey: "crm",
  navigation: buildNavigationFromFeatures(
    resolveFeaturesForPlugin(CRM_FRONTEND_FEATURES),
  ),
} satisfies ErpFrontendPlugin;
