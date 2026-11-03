import { Module } from '@nestjs/common';

import { getFeatureModulesForPlugin } from '@kernel/platform/features/feature-module.utils';

import { PRODUCTION_FEATURES } from '@plugins/production/production.features';

@Module({
  imports: [...getFeatureModulesForPlugin(PRODUCTION_FEATURES)],
})
export class ProductionModule {}
