import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { GatewayModule as CatalogGatewayModule } from '@plugins/catalog/_shared/gateways/gateway.module';
import { StockBalance } from '@plugins/inventory/stock/entities/stock-balance.entity';
import { StockMovement } from '@plugins/inventory/stock/entities/stock-movement.entity';
import { StockReservation } from '@plugins/inventory/stock/entities/stock-reservation.entity';
import { StockAlertService } from '@plugins/inventory/stock/services/stock-alert.service';
import { StockItemReferenceService } from '@plugins/inventory/stock/services/stock-item-reference.service';
import { StockPostingService } from '@plugins/inventory/stock/services/stock-posting.service';
import { StockQueryService } from '@plugins/inventory/stock/services/stock-query.service';
import { StockController } from '@plugins/inventory/stock/stock.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockBalance, StockMovement, StockReservation]),
    AuditModule,
    CatalogGatewayModule,
  ],
  controllers: [StockController],
  providers: [
    StockPostingService,
    StockAlertService,
    StockQueryService,
    StockItemReferenceService,
  ],
  exports: [StockPostingService, StockAlertService],
})
export class StockModule {}
