import {
  getFeaturePermissions,
  runFeatureSeeds,
} from '@kernel/platform/features/feature-module.utils';

import { CATALOG_FEATURES } from '@plugins/catalog/catalog.features';
import { CatalogModule } from '@plugins/catalog/catalog.module';

import type { ErpPlugin } from '@kernel/platform/plugins/plugin.contract';
import type { DataSource } from 'typeorm';

async function seedCatalog(dataSource: DataSource): Promise<void> {
  await runFeatureSeeds(CATALOG_FEATURES, dataSource);
}

export const catalogPlugin = {
  name: 'catalog',
  module: CatalogModule,
  permissions: getFeaturePermissions(CATALOG_FEATURES),
  seed: seedCatalog,
} satisfies ErpPlugin;
