import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProductionIssue } from '@plugins/production/production-issue/entities/production-issue.entity';
import { ProductionIssueController } from '@plugins/production/production-issue/production-issue.controller';
import { ProductionIssueService } from '@plugins/production/production-issue/services/production-issue.service';
import { ProductionOrderModule } from '@plugins/production/production-order/production-order.module';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductionIssue]),
    ProductionOrderModule,
    SalesSharedModule,
  ],
  controllers: [ProductionIssueController],
  providers: [ProductionIssueService],
})
export class ProductionIssueModule {}
