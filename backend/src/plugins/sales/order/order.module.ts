import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { GatewayModule as CrmGatewayModule } from '@plugins/crm/_shared/gateways/gateway.module';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { SalesOrderBomLine } from '@plugins/sales/order/entities/order-bom-line.entity';
import { SalesOrderLine } from '@plugins/sales/order/entities/order-line.entity';
import { SalesOrder } from '@plugins/sales/order/entities/order.entity';
import { OrderController } from '@plugins/sales/order/order.controller';
import { OrderConvertService } from '@plugins/sales/order/services/order-convert.service';
import { OrderEditService } from '@plugins/sales/order/services/order-edit.service';
import { OrderService } from '@plugins/sales/order/services/order.service';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesOrder,
      SalesOrderLine,
      SalesOrderBomLine,
      SalesRequest,
      Estimate,
      Quotation,
    ]),
    AuditModule,
    CrmGatewayModule,
    SalesSharedModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderConvertService, OrderEditService],
  exports: [OrderService],
})
export class OrderModule {}
