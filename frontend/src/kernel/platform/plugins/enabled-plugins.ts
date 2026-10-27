/**
 * Frontend plugin registry — catalog is compile-time; enable list from env.
 *
 * NEXT_PUBLIC_ENABLED_PLUGINS=crm,catalog,sales,inventory (frontend/.env)
 * Omit or empty → all registered plugins enabled.
 * make restart after change (Docker dev) — no rebuild.
 */
import {
  filterFrontendPluginsByKey,
  parseEnabledPluginKeys,
} from "@kernel/platform/plugins/resolve-enabled-plugins";

import { catalogFrontendPlugin } from "@plugins/catalog/plugin";
import { crmFrontendPlugin } from "@plugins/crm/plugin";
import { inventoryFrontendPlugin } from "@plugins/inventory/plugin";
import { salesFrontendPlugin } from "@plugins/sales/plugin";

import type { ErpFrontendPlugin } from "@kernel/platform/plugins/plugin.contract";

/** All frontend plugins shipped in this build */
export const FRONTEND_PLUGIN_CATALOG: ErpFrontendPlugin[] = [
  crmFrontendPlugin,
  catalogFrontendPlugin,
  salesFrontendPlugin,
  inventoryFrontendPlugin,
];

const defaultPluginKeys = FRONTEND_PLUGIN_CATALOG.map((plugin) => plugin.key);

const enabledPluginKeys = parseEnabledPluginKeys(
  process.env.NEXT_PUBLIC_ENABLED_PLUGINS ?? process.env.ENABLED_PLUGINS,
  defaultPluginKeys,
);

export const ENABLED_FRONTEND_PLUGINS: ErpFrontendPlugin[] =
  filterFrontendPluginsByKey(FRONTEND_PLUGIN_CATALOG, enabledPluginKeys);

export function validateFrontendPluginDependencies(
  plugins: ErpFrontendPlugin[] = ENABLED_FRONTEND_PLUGINS,
): void {
  const enabledKeys = new Set(plugins.map((p) => p.key));

  for (const plugin of plugins) {
    for (const dep of plugin.dependsOn ?? []) {
      if (!enabledKeys.has(dep)) {
        throw new Error(
          `Frontend plugin "${plugin.key}" depends on "${dep}" which is not enabled`,
        );
      }
      const depIndex = plugins.findIndex((p) => p.key === dep);
      const pluginIndex = plugins.findIndex((p) => p.key === plugin.key);
      if (depIndex < 0 || depIndex >= pluginIndex) {
        throw new Error(
          `Frontend plugin "${plugin.key}" must be registered after dependency "${dep}"`,
        );
      }
    }
  }
}

validateFrontendPluginDependencies();
