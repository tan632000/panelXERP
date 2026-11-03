import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { ProductionOrderModule } from '@plugins/production/production-order/production-order.module';
import { UnitPhoto } from '@plugins/production/progress/entities/unit-photo.entity';
import { ProgressController } from '@plugins/production/progress/progress.controller';
import { OverdueJob } from '@plugins/production/progress/services/overdue.job';
import { OverdueService } from '@plugins/production/progress/services/overdue.service';
import { ProgressQueryService } from '@plugins/production/progress/services/progress-query.service';
import { ProgressService } from '@plugins/production/progress/services/progress.service';
import { UnitPhotoService } from '@plugins/production/progress/services/unit-photo.service';
import { UnitPhotoController } from '@plugins/production/progress/unit-photo.controller';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UnitPhoto]),
    AuditModule,
    ProductionOrderModule,
    SalesSharedModule,
  ],
  controllers: [ProgressController, UnitPhotoController],
  providers: [
    ProgressService,
    ProgressQueryService,
    UnitPhotoService,
    OverdueService,
    OverdueJob,
  ],
})
export class ProgressModule {}
