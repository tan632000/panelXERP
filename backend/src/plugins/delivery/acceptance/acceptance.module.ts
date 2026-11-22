import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AcceptanceController } from '@plugins/delivery/acceptance/acceptance.controller';
import { AcceptanceFile } from '@plugins/delivery/acceptance/entities/acceptance-file.entity';
import { Acceptance } from '@plugins/delivery/acceptance/entities/acceptance.entity';
import { AcceptanceAccess } from '@plugins/delivery/acceptance/services/acceptance-access.service';
import { AcceptanceQueryService } from '@plugins/delivery/acceptance/services/acceptance-query.service';
import { AcceptanceService } from '@plugins/delivery/acceptance/services/acceptance.service';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Acceptance, AcceptanceFile]),
    SalesSharedModule,
  ],
  controllers: [AcceptanceController],
  providers: [AcceptanceAccess, AcceptanceQueryService, AcceptanceService],
})
export class AcceptanceModule {}
