import { Module } from '@nestjs/common';

import { getFeatureModulesForPlugin } from '@kernel/platform/features/feature-module.utils';

import { GatewayModule } from '@plugins/crm/_shared/gateways/gateway.module';
import { CRM_FEATURES } from '@plugins/crm/crm.features';

@Module({
  imports: [...getFeatureModulesForPlugin(CRM_FEATURES), GatewayModule],
  exports: [GatewayModule],
})
export class CrmModule {}
