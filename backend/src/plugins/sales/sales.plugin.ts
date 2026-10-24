import {
  getFeaturePermissions,
  runFeatureSeeds,
} from '@kernel/platform/features/feature-module.utils';

import { SALES_FEATURES } from '@plugins/sales/sales.features';
import { SalesModule } from '@plugins/sales/sales.module';

import type { ErpPlugin } from '@kernel/platform/plugins/plugin.contract';
import type { DataSource } from 'typeorm';

async function seedSales(dataSource: DataSource): Promise<void> {
  await runFeatureSeeds(SALES_FEATURES, dataSource);
}

export const salesPlugin = {
  name: 'sales',
  dependsOn: ['crm'],
  module: SalesModule,
  permissions: getFeaturePermissions(SALES_FEATURES),
  seed: seedSales,
} satisfies ErpPlugin;
