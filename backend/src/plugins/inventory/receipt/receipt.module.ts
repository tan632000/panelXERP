import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MaterialModule } from '@plugins/inventory/material/material.module';
import { StockReceiptLine } from '@plugins/inventory/receipt/entities/stock-receipt-line.entity';
import { StockReceipt } from '@plugins/inventory/receipt/entities/stock-receipt.entity';
import { StockReceiptController } from '@plugins/inventory/receipt/receipt.controller';
import { StockReceiptService } from '@plugins/inventory/receipt/services/receipt.service';
import { StockModule } from '@plugins/inventory/stock/stock.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockReceipt, StockReceiptLine]),
    StockModule,
    MaterialModule,
  ],
  controllers: [StockReceiptController],
  providers: [StockReceiptService],
})
export class StockReceiptModule {}
