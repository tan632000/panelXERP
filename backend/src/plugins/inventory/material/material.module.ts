import { Module } from '@nestjs/common';

import { MaterialController } from '@plugins/inventory/material/material.controller';
import { MaterialService } from '@plugins/inventory/material/services/material.service';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';

@Module({
  imports: [SalesSharedModule],
  controllers: [MaterialController],
  providers: [MaterialService],
})
export class MaterialModule {}
