import {
  getFeaturePermissions,
  runFeatureSeeds,
} from '@kernel/platform/features/feature-module.utils';

import { PRODUCTION_FEATURES } from '@plugins/production/production.features';
import { ProductionModule } from '@plugins/production/production.module';

import type { ErpPlugin } from '@kernel/platform/plugins/plugin.contract';
import type { DataSource } from 'typeorm';

async function seedProduction(dataSource: DataSource): Promise<void> {
  await runFeatureSeeds(PRODUCTION_FEATURES, dataSource);
}

export const productionPlugin = {
  name: 'production',
  dependsOn: ['catalog', 'sales', 'inventory'],
  module: ProductionModule,
  permissions: getFeaturePermissions(PRODUCTION_FEATURES),
  seed: seedProduction,
} satisfies ErpPlugin;
