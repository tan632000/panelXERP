/**
 * Plugin registry — catalog is compile-time; enable list from env at runtime.
 *
 * ENABLED_PLUGINS=crm,catalog,sales (backend/.env or root .env via compose)
 * Omit or empty → all registered plugins enabled.
 * Restart backend after change — no rebuild.
 */
import {
  filterPluginsByName,
  parseEnabledPluginNames,
} from '@kernel/platform/plugins/resolve-enabled-plugins';

import { crmPlugin } from '@plugins/crm/crm.plugin';

import type { ErpPlugin } from '@kernel/platform/plugins/plugin.contract';
import type { DataSource } from 'typeorm';

/** All plugins shipped in this build — add new plugins here only */
export const PLUGIN_CATALOG: ErpPlugin[] = [crmPlugin];

const defaultPluginNames = PLUGIN_CATALOG.map((plugin) => plugin.name);

const enabledPluginNames = parseEnabledPluginNames(
  process.env.ENABLED_PLUGINS,
  defaultPluginNames,
);

export const ENABLED_PLUGINS: ErpPlugin[] = filterPluginsByName(
  PLUGIN_CATALOG,
  enabledPluginNames,
);

export function validatePluginDependencies(
  plugins: ErpPlugin[] = ENABLED_PLUGINS,
): void {
  const enabledNames = new Set(plugins.map((p) => p.name));

  for (const plugin of plugins) {
    for (const dep of plugin.dependsOn ?? []) {
      if (!enabledNames.has(dep)) {
        throw new Error(
          `Plugin "${plugin.name}" depends on "${dep}" which is not enabled`,
        );
      }
      const depIndex = plugins.findIndex((p) => p.name === dep);
      const pluginIndex = plugins.findIndex((p) => p.name === plugin.name);
      if (depIndex < 0 || depIndex >= pluginIndex) {
        throw new Error(
          `Plugin "${plugin.name}" must be registered after dependency "${dep}"`,
        );
      }
    }
  }
}

validatePluginDependencies();

export function getAllPluginPermissions(): string[] {
  return ENABLED_PLUGINS.flatMap((p) => p.permissions ?? []);
}

/** Collect all seed functions from plugins that define one */
export function getAllPluginSeeds(): Array<
  (dataSource: DataSource) => Promise<void>
> {
  return ENABLED_PLUGINS.flatMap((p) => (p.seed ? [p.seed] : []));
}
