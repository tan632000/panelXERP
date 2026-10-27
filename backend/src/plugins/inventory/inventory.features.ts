import { supplierPermissions } from '@plugins/inventory/supplier/permissions/supplier.permissions';
import { SupplierModule } from '@plugins/inventory/supplier/supplier.module';

import type { ErpFeature } from '@kernel/platform/features/feature.contract';

/** Inventory feature catalog — a feature left out of ENABLED_FEATURES loses its routes and migrations. */
export const INVENTORY_FEATURES: ErpFeature[] = [
  {
    key: 'supplier',
    plugin: 'inventory',
    module: SupplierModule,
    permissions: supplierPermissions,
  },
];
