import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Location } from '@plugins/catalog/location/entities/location.entity';
import { LocationController } from '@plugins/catalog/location/location.controller';
import { LocationService } from '@plugins/catalog/location/services/location.service';

@Module({
  imports: [TypeOrmModule.forFeature([Location])],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
