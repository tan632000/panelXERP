import { Module } from '@nestjs/common';

import { OrderShortagePort } from '@plugins/inventory/_shared/ports/order-shortage.port';
import { MaterialModule } from '@plugins/inventory/material/material.module';

/** What inventory offers other plugins: the ports that answer from its data. */
@Module({
  imports: [MaterialModule],
  providers: [OrderShortagePort],
  exports: [OrderShortagePort],
})
export class InventorySharedModule {}
