import {
  getFeaturePermissions,
  runFeatureSeeds,
} from '@kernel/platform/features/feature-module.utils';

import { INVENTORY_FEATURES } from '@plugins/inventory/inventory.features';
import { InventoryModule } from '@plugins/inventory/inventory.module';

import type { ErpPlugin } from '@kernel/platform/plugins/plugin.contract';
import type { DataSource } from 'typeorm';

async function seedInventory(dataSource: DataSource): Promise<void> {
  await runFeatureSeeds(INVENTORY_FEATURES, dataSource);
}

export const inventoryPlugin = {
  name: 'inventory',
  dependsOn: ['catalog', 'sales'],
  module: InventoryModule,
  permissions: getFeaturePermissions(INVENTORY_FEATURES),
  seed: seedInventory,
} satisfies ErpPlugin;
