import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CrmGateway } from '@plugins/crm/_shared/gateways/crm-gateway';
import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Project])],
  providers: [CrmGateway, ReferenceCheckRegistry],
  exports: [CrmGateway, ReferenceCheckRegistry],
})
export class GatewayModule {}
