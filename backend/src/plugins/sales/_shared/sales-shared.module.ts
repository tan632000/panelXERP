import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '@kernel/core/users/entities/user.entity';

import { RequestStatusPort } from '@plugins/sales/_shared/ports/request-status.port';
import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';

/** What the sales features share: the ports that act on a request, and the account lookup. */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [RequestStatusPort, SalesUserLookup],
  exports: [RequestStatusPort, SalesUserLookup],
})
export class SalesSharedModule {}
