import { Module } from '@nestjs/common';

import { getFeatureModulesForPlugin } from '@kernel/platform/features/feature-module.utils';

import { GatewayModule } from '@plugins/inventory/_shared/gateways/gateway.module';
import { INVENTORY_FEATURES } from '@plugins/inventory/inventory.features';

@Module({
  imports: [...getFeatureModulesForPlugin(INVENTORY_FEATURES), GatewayModule],
  exports: [GatewayModule],
})
export class InventoryModule {}
