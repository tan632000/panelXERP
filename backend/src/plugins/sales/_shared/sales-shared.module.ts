import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';
import { User } from '@kernel/core/users/entities/user.entity';

import { EstimateReadPort } from '@plugins/sales/_shared/ports/estimate-read.port';
import { OrderLifecycleRegistry } from '@plugins/sales/_shared/ports/order-lifecycle-registry';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { OrderProductionPort } from '@plugins/sales/_shared/ports/order-production.port';
import { RequestCloseRegistry } from '@plugins/sales/_shared/ports/request-close-registry';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { OrderFollowerNotifier } from '@plugins/sales/_shared/services/order-follower-notifier';
import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';

/**
 * What the sales features share: the ports that act on a request or read an estimate, the
 * request-close hook registry, the account lookup and the notice to the followers of an order.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User]), AuditModule],
  providers: [
    RequestStatusPort,
    EstimateReadPort,
    OrderLifecycleRegistry,
    OrderMaterialReadPort,
    OrderProductionPort,
    RequestCloseRegistry,
    SalesUserLookup,
    OrderFollowerNotifier,
  ],
  exports: [
    RequestStatusPort,
    EstimateReadPort,
    OrderLifecycleRegistry,
    OrderMaterialReadPort,
    OrderProductionPort,
    RequestCloseRegistry,
    SalesUserLookup,
    OrderFollowerNotifier,
  ],
})
export class SalesSharedModule {}
