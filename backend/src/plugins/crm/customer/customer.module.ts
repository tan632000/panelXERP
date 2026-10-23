import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '@kernel/core/users/entities/user.entity';

import { GatewayModule } from '@plugins/crm/_shared/gateways/gateway.module';
import { CustomerController } from '@plugins/crm/customer/customer.controller';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { CustomerService } from '@plugins/crm/customer/services/customer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, User]), GatewayModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
