import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { GatewayModule } from '@plugins/crm/_shared/gateways/gateway.module';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';
import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';
import { SalesRequestAttachment } from '@plugins/sales/request/entities/request-attachment.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestAttachmentController } from '@plugins/sales/request/request-attachment.controller';
import { RequestController } from '@plugins/sales/request/request.controller';
import { RequestAttachmentService } from '@plugins/sales/request/services/request-attachment.service';
import { RequestService } from '@plugins/sales/request/services/request.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesRequest,
      SalesRequestActivity,
      SalesRequestAttachment,
    ]),
    AuditModule,
    GatewayModule,
    SalesSharedModule,
  ],
  controllers: [RequestController, RequestAttachmentController],
  providers: [RequestService, RequestAttachmentService],
  exports: [RequestService],
})
export class RequestModule {}
