import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GatewayModule as CatalogGatewayModule } from '@plugins/catalog/_shared/gateways/gateway.module';
import { MaterialModule } from '@plugins/inventory/material/material.module';
import { StockModule } from '@plugins/inventory/stock/stock.module';
import { StocktakeCountLog } from '@plugins/inventory/stocktake/entities/stocktake-count-log.entity';
import { StocktakeLine } from '@plugins/inventory/stocktake/entities/stocktake-line.entity';
import { Stocktake } from '@plugins/inventory/stocktake/entities/stocktake.entity';
import { StocktakeApprovalService } from '@plugins/inventory/stocktake/services/stocktake-approval.service';
import { StocktakeReferenceService } from '@plugins/inventory/stocktake/services/stocktake-reference.service';
import { StocktakeService } from '@plugins/inventory/stocktake/services/stocktake.service';
import { StocktakeController } from '@plugins/inventory/stocktake/stocktake.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stocktake, StocktakeLine, StocktakeCountLog]),
    StockModule,
    MaterialModule,
    CatalogGatewayModule,
  ],
  controllers: [StocktakeController],
  providers: [
    StocktakeService,
    StocktakeApprovalService,
    StocktakeReferenceService,
  ],
})
export class StocktakeModule {}
