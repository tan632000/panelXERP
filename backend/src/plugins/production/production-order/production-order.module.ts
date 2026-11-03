import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { InventorySharedModule } from '@plugins/inventory/_shared/inventory-shared.module';
import { ProductionOrderEvent } from '@plugins/production/production-order/entities/production-order-event.entity';
import { ProductionOrder } from '@plugins/production/production-order/entities/production-order.entity';
import { ProductionUnitStage } from '@plugins/production/production-order/entities/production-unit-stage.entity';
import { ProductionUnit } from '@plugins/production/production-order/entities/production-unit.entity';
import { ProductionOrderController } from '@plugins/production/production-order/production-order.controller';
import { ProductionOrderNotifier } from '@plugins/production/production-order/services/production-order-notifier.service';
import { ProductionOrderQueryService } from '@plugins/production/production-order/services/production-order-query.service';
import { ProductionOrderReleaseService } from '@plugins/production/production-order/services/production-order-release.service';
import { ProductionOrderUnitService } from '@plugins/production/production-order/services/production-order-unit.service';
import { ProductionOrderService } from '@plugins/production/production-order/services/production-order.service';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionOrder,
      ProductionUnit,
      ProductionUnitStage,
      ProductionOrderEvent,
    ]),
    AuditModule,
    SalesSharedModule,
    InventorySharedModule,
  ],
  controllers: [ProductionOrderController],
  providers: [
    ProductionOrderService,
    ProductionOrderQueryService,
    ProductionOrderReleaseService,
    ProductionOrderUnitService,
    ProductionOrderNotifier,
  ],
  exports: [ProductionOrderQueryService, ProductionOrderNotifier],
})
export class ProductionOrderModule {}
