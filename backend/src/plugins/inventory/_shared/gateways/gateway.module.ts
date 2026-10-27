import { Module } from '@nestjs/common';

import { SupplierReferenceCheckRegistry } from '@plugins/inventory/_shared/gateways/supplier-reference-check-registry';

@Module({
  providers: [SupplierReferenceCheckRegistry],
  exports: [SupplierReferenceCheckRegistry],
})
export class GatewayModule {}
