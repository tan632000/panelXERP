import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { GatewayModule as CrmGatewayModule } from '@plugins/crm/_shared/gateways/gateway.module';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';
import { QuotationBomLine } from '@plugins/sales/quotation/entities/quotation-bom-line.entity';
import { QuotationCostLine } from '@plugins/sales/quotation/entities/quotation-cost-line.entity';
import { QuotationFeedback } from '@plugins/sales/quotation/entities/quotation-feedback.entity';
import { QuotationLine } from '@plugins/sales/quotation/entities/quotation-line.entity';
import { QuotationVersion } from '@plugins/sales/quotation/entities/quotation-version.entity';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import { QuotationController } from '@plugins/sales/quotation/quotation.controller';
import { QuotationApprovalService } from '@plugins/sales/quotation/services/quotation-approval.service';
import { QuotationFeedbackService } from '@plugins/sales/quotation/services/quotation-feedback.service';
import { QuotationPdfService } from '@plugins/sales/quotation/services/quotation-pdf.service';
import { QuotationVersionService } from '@plugins/sales/quotation/services/quotation-version.service';
import { QuotationService } from '@plugins/sales/quotation/services/quotation.service';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Quotation,
      QuotationVersion,
      QuotationLine,
      QuotationBomLine,
      QuotationCostLine,
      QuotationFeedback,
      SalesRequest,
    ]),
    AuditModule,
    CrmGatewayModule,
    SalesSharedModule,
  ],
  controllers: [QuotationController],
  providers: [
    QuotationService,
    QuotationVersionService,
    QuotationApprovalService,
    QuotationFeedbackService,
    QuotationPdfService,
  ],
  exports: [QuotationService],
})
export class QuotationModule {}
