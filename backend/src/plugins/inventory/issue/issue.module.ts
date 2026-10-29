import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StockIssueLine } from '@plugins/inventory/issue/entities/stock-issue-line.entity';
import { StockIssue } from '@plugins/inventory/issue/entities/stock-issue.entity';
import { StockWorkshopReturnLine } from '@plugins/inventory/issue/entities/stock-workshop-return-line.entity';
import { StockWorkshopReturn } from '@plugins/inventory/issue/entities/stock-workshop-return.entity';
import { StockIssueController } from '@plugins/inventory/issue/issue.controller';
import { StockIssueService } from '@plugins/inventory/issue/services/issue.service';
import { OrderStockDocumentReader } from '@plugins/inventory/issue/services/order-stock-document.reader';
import { WorkshopReturnService } from '@plugins/inventory/issue/services/workshop-return.service';
import { WorkshopReturnController } from '@plugins/inventory/issue/workshop-return.controller';
import { MaterialModule } from '@plugins/inventory/material/material.module';
import { StockModule } from '@plugins/inventory/stock/stock.module';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockIssue,
      StockIssueLine,
      StockWorkshopReturn,
      StockWorkshopReturnLine,
    ]),
    StockModule,
    MaterialModule,
    SalesSharedModule,
  ],
  controllers: [StockIssueController, WorkshopReturnController],
  providers: [
    StockIssueService,
    WorkshopReturnService,
    OrderStockDocumentReader,
  ],
})
export class StockIssueModule {}
