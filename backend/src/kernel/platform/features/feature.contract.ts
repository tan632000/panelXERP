import type { Type } from '@nestjs/common';
import type { DataSource } from 'typeorm';

/** One deployable feature slice inside a plugin (company, rfq, mold, …) */
export interface ErpFeature {
  key: string;
  plugin: string;
  /**
   * Directory under the plugin holding this feature's code, when it differs from `key`.
   *
   * Keys are unique across every plugin, so a feature whose bare name collides with another
   * plugin's carries a prefix (`procurement-document`) that its directory does not
   * (`procurement/document`). Migration discovery walks the directory, not the key, so it
   * needs the real path. Defaults to `key`.
   */
  directory?: string;
  dependsOn?: readonly string[];
  module?: Type<unknown>;
  permissions?: readonly string[];
  /**
   * The role-matrix module this feature's scopes are listed under, when it is not the plugin's
   * own. The reports live in the sales plugin, yet the Function List and the sidebar treat them
   * as a module of their own (FL 11.x), so the matrix must too.
   */
  permissionModule?: string;
  seed?: (dataSource: DataSource) => Promise<void>;
}
