import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '@kernel/core/users/entities/user.entity';

import { EstimateReadPort } from '@plugins/sales/_shared/ports/estimate-read.port';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { RequestCloseRegistry } from '@plugins/sales/_shared/ports/request-close-registry';
import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';

/**
 * What the sales features share: the ports that act on a request or read an estimate, the
 * request-close hook registry, and the account lookup.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [
    RequestStatusPort,
    EstimateReadPort,
    OrderMaterialReadPort,
    RequestCloseRegistry,
    SalesUserLookup,
  ],
  exports: [
    RequestStatusPort,
    EstimateReadPort,
    OrderMaterialReadPort,
    RequestCloseRegistry,
    SalesUserLookup,
  ],
})
export class SalesSharedModule {}
