import { Module } from '@nestjs/common';

import { getFeatureModulesForPlugin } from '@kernel/platform/features/feature-module.utils';

import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';
import { SALES_FEATURES } from '@plugins/sales/sales.features';

@Module({
  imports: [...getFeatureModulesForPlugin(SALES_FEATURES), SalesSharedModule],
  exports: [SalesSharedModule],
})
export class SalesModule {}
