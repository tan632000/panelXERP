import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatalogGateway } from '@plugins/catalog/_shared/gateways/catalog-gateway';
import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { Item } from '@plugins/catalog/item/entities/item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Item])],
  providers: [CatalogGateway, ReferenceCheckRegistry],
  exports: [CatalogGateway, ReferenceCheckRegistry],
})
export class GatewayModule {}
