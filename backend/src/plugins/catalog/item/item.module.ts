import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GatewayModule } from '@plugins/catalog/_shared/gateways/gateway.module';
import { Item } from '@plugins/catalog/item/entities/item.entity';
import { ItemController } from '@plugins/catalog/item/item.controller';
import { ItemImportService } from '@plugins/catalog/item/services/item-import.service';
import { ItemLabelService } from '@plugins/catalog/item/services/item-label.service';
import { ItemStockSettingsService } from '@plugins/catalog/item/services/item-stock-settings.service';
import { ItemService } from '@plugins/catalog/item/services/item.service';
import { Location } from '@plugins/catalog/location/entities/location.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Item, Location]), GatewayModule],
  controllers: [ItemController],
  providers: [
    ItemService,
    ItemImportService,
    ItemStockSettingsService,
    ItemLabelService,
  ],
  exports: [ItemService],
})
export class ItemModule {}
