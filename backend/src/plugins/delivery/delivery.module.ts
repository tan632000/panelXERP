import { Module } from '@nestjs/common';

import { getFeatureModulesForPlugin } from '@kernel/platform/features/feature-module.utils';

import { DELIVERY_FEATURES } from '@plugins/delivery/delivery.features';

@Module({
  imports: [...getFeatureModulesForPlugin(DELIVERY_FEATURES)],
})
export class DeliveryModule {}
