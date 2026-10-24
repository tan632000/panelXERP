import { Module } from '@nestjs/common';

import { getFeatureModulesForPlugin } from '@kernel/platform/features/feature-module.utils';

import { GatewayModule } from '@plugins/catalog/_shared/gateways/gateway.module';
import { CATALOG_FEATURES } from '@plugins/catalog/catalog.features';

@Module({
  imports: [...getFeatureModulesForPlugin(CATALOG_FEATURES), GatewayModule],
  exports: [GatewayModule],
})
export class CatalogModule {}
