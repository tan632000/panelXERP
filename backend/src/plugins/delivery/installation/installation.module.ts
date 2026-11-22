import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstallationPhoto } from '@plugins/delivery/installation/entities/installation-photo.entity';
import { Installation } from '@plugins/delivery/installation/entities/installation.entity';
import { InstallationPhotoController } from '@plugins/delivery/installation/installation-photo.controller';
import { InstallationController } from '@plugins/delivery/installation/installation.controller';
import { InstallationAccess } from '@plugins/delivery/installation/services/installation-access.service';
import { InstallationPhotoService } from '@plugins/delivery/installation/services/installation-photo.service';
import { InstallationQueryService } from '@plugins/delivery/installation/services/installation-query.service';
import { InstallationService } from '@plugins/delivery/installation/services/installation.service';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Installation, InstallationPhoto]),
    SalesSharedModule,
  ],
  controllers: [InstallationController, InstallationPhotoController],
  providers: [
    InstallationAccess,
    InstallationQueryService,
    InstallationService,
    InstallationPhotoService,
  ],
})
export class InstallationModule {}
