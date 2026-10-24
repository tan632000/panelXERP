import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GatewayModule } from '@plugins/catalog/_shared/gateways/gateway.module';
import { Item } from '@plugins/catalog/item/entities/item.entity';
import { ItemController } from '@plugins/catalog/item/item.controller';
import { ItemImportService } from '@plugins/catalog/item/services/item-import.service';
import { ItemService } from '@plugins/catalog/item/services/item.service';

@Module({
  imports: [TypeOrmModule.forFeature([Item]), GatewayModule],
  controllers: [ItemController],
  providers: [ItemService, ItemImportService],
  exports: [ItemService],
})
export class ItemModule {}
