import type { HookRegistry } from '@kernel/platform/plugins/hook-registry';
import type { Type } from '@nestjs/common';
import type { DataSource } from 'typeorm';

/**
 * Plugin contract interface.
 * Each business module implements this to register with PluginRegistry.
 */
export interface ErpPlugin {
  /** Unique plugin identifier (e.g. 'master-data', 'sales') */
  name: string;

  /** Upstream plugins this plugin depends on (migration/seed order) */
  dependsOn?: readonly string[];

  /** NestJS module path for AppModule to import */
  module: Type<unknown>;

  /** Permission keys owned by this plugin */
  permissions?: readonly string[];

  /**
   * Scope resources the role matrix lists under another module than this plugin's, keyed by
   * resource (see `ErpFeature.permissionModule`).
   */
  permissionModules?: Readonly<Record<string, string>>;

  /**
   * Seed function — invoked by `seed-runner`.
   * Creates sample / initial data for the plugin.
   * Receives DataSource for direct DB access.
   */
  seed?: (dataSource: DataSource) => Promise<void>;

  /**
   * Extension points — optional hooks/entities/fields a plugin exposes
   * for customer-specific customization without modifying kernel code.
   * Registration happens at plugin bootstrap via HookRegistry.
   */
  extend?: {
    /** Register lifecycle hooks */
    registerHooks?: (registry: HookRegistry) => void;
  };
}
