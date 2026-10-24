import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GatewayModule } from '@plugins/crm/_shared/gateways/gateway.module';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';
import { Project } from '@plugins/crm/project/entities/project.entity';
import { ProjectController } from '@plugins/crm/project/project.controller';
import { ProjectService } from '@plugins/crm/project/services/project.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Customer]), GatewayModule],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
