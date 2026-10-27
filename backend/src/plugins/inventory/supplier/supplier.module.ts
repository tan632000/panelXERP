import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GatewayModule } from '@plugins/inventory/_shared/gateways/gateway.module';
import { Supplier } from '@plugins/inventory/supplier/entities/supplier.entity';
import { SupplierService } from '@plugins/inventory/supplier/services/supplier.service';
import { SupplierController } from '@plugins/inventory/supplier/supplier.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier]), GatewayModule],
  controllers: [SupplierController],
  providers: [SupplierService],
  exports: [SupplierService],
})
export class SupplierModule {}
