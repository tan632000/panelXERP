import { Module } from '@nestjs/common';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { MaterialController } from '@plugins/inventory/material/material.controller';
import { MaterialService } from '@plugins/inventory/material/services/material.service';
import { ReservationService } from '@plugins/inventory/material/services/reservation.service';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import { StockModule } from '@plugins/inventory/stock/stock.module';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';

@Module({
  imports: [SalesSharedModule, StockModule, AuditModule],
  controllers: [MaterialController],
  providers: [MaterialService, ReservationService, ShortageAlertService],
  exports: [ReservationService, ShortageAlertService],
})
export class MaterialModule {}
