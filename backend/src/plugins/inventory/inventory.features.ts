import { StockIssueModule } from '@plugins/inventory/issue/issue.module';
import { stockIssuePermissions } from '@plugins/inventory/issue/permissions/issue.permissions';
import { MaterialModule } from '@plugins/inventory/material/material.module';
import { materialPermissions } from '@plugins/inventory/material/permissions/material.permissions';
import { purchaseOrderPermissions } from '@plugins/inventory/purchase-order/permissions/purchase-order.permissions';
import { PurchaseOrderModule } from '@plugins/inventory/purchase-order/purchase-order.module';
import { purchaseRequestPermissions } from '@plugins/inventory/purchase-request/permissions/purchase-request.permissions';
import { PurchaseRequestModule } from '@plugins/inventory/purchase-request/purchase-request.module';
import { stockReceiptPermissions } from '@plugins/inventory/receipt/permissions/receipt.permissions';
import { StockReceiptModule } from '@plugins/inventory/receipt/receipt.module';
import { stockPermissions } from '@plugins/inventory/stock/permissions/stock.permissions';
import { StockModule } from '@plugins/inventory/stock/stock.module';
import { stocktakePermissions } from '@plugins/inventory/stocktake/permissions/stocktake.permissions';
import { StocktakeModule } from '@plugins/inventory/stocktake/stocktake.module';
import { supplierPermissions } from '@plugins/inventory/supplier/permissions/supplier.permissions';
import { SupplierModule } from '@plugins/inventory/supplier/supplier.module';
import { SupplierReturnModule } from '@plugins/inventory/supplier-return/supplier-return.module';

import type { ErpFeature } from '@kernel/platform/features/feature.contract';

/** Inventory feature catalog — a feature left out of ENABLED_FEATURES loses its routes and migrations. */
export const INVENTORY_FEATURES: ErpFeature[] = [
  {
    key: 'supplier',
    plugin: 'inventory',
    module: SupplierModule,
    permissions: supplierPermissions,
  },
  {
    key: 'stock',
    plugin: 'inventory',
    module: StockModule,
    permissions: stockPermissions,
  },
  {
    key: 'purchase-order',
    plugin: 'inventory',
    module: PurchaseOrderModule,
    permissions: purchaseOrderPermissions,
  },
  {
    key: 'material',
    plugin: 'inventory',
    module: MaterialModule,
    permissions: materialPermissions,
  },
  {
    key: 'receipt',
    plugin: 'inventory',
    module: StockReceiptModule,
    permissions: stockReceiptPermissions,
  },
  {
    key: 'issue',
    plugin: 'inventory',
    module: StockIssueModule,
    permissions: stockIssuePermissions,
  },
  {
    key: 'supplier-return',
    plugin: 'inventory',
    module: SupplierReturnModule,
    // Gated by `stock_return:*`, which the issue feature declares with workshop returns.
    permissions: [],
  },
  {
    key: 'stocktake',
    plugin: 'inventory',
    module: StocktakeModule,
    permissions: stocktakePermissions,
  },
  {
    key: 'purchase-request',
    plugin: 'inventory',
    module: PurchaseRequestModule,
    permissions: purchaseRequestPermissions,
  },
];
