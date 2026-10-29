import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GatewayModule as CatalogGatewayModule } from '@plugins/catalog/_shared/gateways/gateway.module';
import { PurchaseRequestLine } from '@plugins/inventory/purchase-request/entities/purchase-request-line.entity';
import { PurchaseRequest } from '@plugins/inventory/purchase-request/entities/purchase-request.entity';
import { PurchaseRequestController } from '@plugins/inventory/purchase-request/purchase-request.controller';
import { PurchaseRequestReferenceService } from '@plugins/inventory/purchase-request/services/purchase-request-reference.service';
import { PurchaseRequestService } from '@plugins/inventory/purchase-request/services/purchase-request.service';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseRequest, PurchaseRequestLine]),
    CatalogGatewayModule,
    SalesSharedModule,
  ],
  controllers: [PurchaseRequestController],
  providers: [PurchaseRequestService, PurchaseRequestReferenceService],
})
export class PurchaseRequestModule {}
