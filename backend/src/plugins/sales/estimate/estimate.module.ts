import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { GatewayModule as CatalogGatewayModule } from '@plugins/catalog/_shared/gateways/gateway.module';
import { GatewayModule as CrmGatewayModule } from '@plugins/crm/_shared/gateways/gateway.module';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';
import { EstimateBomLine } from '@plugins/sales/estimate/entities/estimate-bom-line.entity';
import { EstimateCostLine } from '@plugins/sales/estimate/entities/estimate-cost-line.entity';
import { EstimatePanel } from '@plugins/sales/estimate/entities/estimate-panel.entity';
import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { EstimateController } from '@plugins/sales/estimate/estimate.controller';
import { EstimateEditService } from '@plugins/sales/estimate/services/estimate-edit.service';
import { EstimatePricingService } from '@plugins/sales/estimate/services/estimate-pricing.service';
import { EstimateService } from '@plugins/sales/estimate/services/estimate.service';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Estimate,
      EstimateRevision,
      EstimatePanel,
      EstimateBomLine,
      EstimateCostLine,
      SalesRequest,
    ]),
    AuditModule,
    CatalogGatewayModule,
    CrmGatewayModule,
    SalesSharedModule,
  ],
  controllers: [EstimateController],
  providers: [EstimateService, EstimateEditService, EstimatePricingService],
  exports: [EstimateService],
})
export class EstimateModule {}
