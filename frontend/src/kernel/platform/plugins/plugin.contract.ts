import type { ModuleNavigation } from "@kernel/platform/plugins/navigation.types";
import type { AnySlotContribution } from "@kernel/platform/plugins/slot.types";

export interface ErpFrontendPlugin {
  key: string;
  name: string;
  /** Upstream plugins this module reads data from */
  dependsOn?: readonly string[];
  /** Sidebar module key — multiple plugins may merge into one sidebar module */
  navigationModuleKey: string;
  navigation: ModuleNavigation;
  /**
   * UI this plugin renders inside another plugin's screens, resolved through the enabled-plugin
   * list rather than a build-time import. See `PluginSlot`.
   */
  slots?: readonly AnySlotContribution[];
}
