import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MaterialModule } from '@plugins/inventory/material/material.module';
import { StockModule } from '@plugins/inventory/stock/stock.module';
import { StockSupplierReturnLine } from '@plugins/inventory/supplier-return/entities/stock-supplier-return-line.entity';
import { StockSupplierReturn } from '@plugins/inventory/supplier-return/entities/stock-supplier-return.entity';
import { SupplierReturnService } from '@plugins/inventory/supplier-return/services/supplier-return.service';
import { SupplierReturnController } from '@plugins/inventory/supplier-return/supplier-return.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockSupplierReturn, StockSupplierReturnLine]),
    StockModule,
    MaterialModule,
  ],
  controllers: [SupplierReturnController],
  providers: [SupplierReturnService],
})
export class SupplierReturnModule {}
