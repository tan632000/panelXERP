import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FeatureFlag } from '@kernel/platform/features/feature-flag.entity';
import { FeatureFlagService } from '@kernel/platform/features/feature-flag.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([FeatureFlag])],
  providers: [FeatureFlagService],
  exports: [FeatureFlagService],
})
export class FeaturesModule {}
