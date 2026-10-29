import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { GatewayModule as CatalogGatewayModule } from '@plugins/catalog/_shared/gateways/gateway.module';
import { GatewayModule as InventoryGatewayModule } from '@plugins/inventory/_shared/gateways/gateway.module';
import { PurchaseOrderEvent } from '@plugins/inventory/purchase-order/entities/purchase-order-event.entity';
import { PurchaseOrderLine } from '@plugins/inventory/purchase-order/entities/purchase-order-line.entity';
import { PurchaseOrder } from '@plugins/inventory/purchase-order/entities/purchase-order.entity';
import { PurchaseOrderController } from '@plugins/inventory/purchase-order/purchase-order.controller';
import { PurchaseOrderApprovalService } from '@plugins/inventory/purchase-order/services/purchase-order-approval.service';
import { PurchaseOrderFromRequestsService } from '@plugins/inventory/purchase-order/services/purchase-order-from-requests.service';
import { PurchaseOrderReferenceService } from '@plugins/inventory/purchase-order/services/purchase-order-reference.service';
import { PurchaseOrderService } from '@plugins/inventory/purchase-order/services/purchase-order.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderLine,
      PurchaseOrderEvent,
    ]),
    AuditModule,
    CatalogGatewayModule,
    InventoryGatewayModule,
  ],
  controllers: [PurchaseOrderController],
  providers: [
    PurchaseOrderService,
    PurchaseOrderApprovalService,
    PurchaseOrderFromRequestsService,
    PurchaseOrderReferenceService,
  ],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
