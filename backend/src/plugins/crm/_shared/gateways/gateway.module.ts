import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CrmGateway } from '@plugins/crm/_shared/gateways/crm-gateway';
import { CustomerOwnerChangeRegistry } from '@plugins/crm/_shared/gateways/customer-owner-change-registry';
import { ReferenceCheckRegistry } from '@plugins/crm/_shared/gateways/reference-check-registry';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Project, Contact])],
  providers: [CrmGateway, ReferenceCheckRegistry, CustomerOwnerChangeRegistry],
  exports: [CrmGateway, ReferenceCheckRegistry, CustomerOwnerChangeRegistry],
})
export class GatewayModule {}
