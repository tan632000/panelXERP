import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { SupplierReferenceCheckRegistry } from '@plugins/inventory/_shared/gateways/supplier-reference-check-registry';
import { PURCHASE_ORDER_REFERENCE_CHECK } from '@plugins/inventory/purchase-order/constants/purchase-order.constant';

/**
 * Purchase orders veto deleting what they point at: a supplier with any order at all (its
 * history names it), and an item on a line of an order that is not cancelled.
 */
@Injectable()
export class PurchaseOrderReferenceService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly itemChecks: ReferenceCheckRegistry,
    private readonly supplierChecks: SupplierReferenceCheckRegistry,
  ) {}

  onModuleInit(): void {
    this.supplierChecks.register(
      PURCHASE_ORDER_REFERENCE_CHECK,
      async (supplierId) => {
        const rows: unknown[] = await this.dataSource.query(
          `SELECT 1 FROM purchase_orders WHERE supplier_id = $1 LIMIT 1`,
          [supplierId],
        );
        return rows.length > 0;
      },
    );
    this.itemChecks.registerItemCheck(
      PURCHASE_ORDER_REFERENCE_CHECK,
      async (itemId) => {
        const rows: unknown[] = await this.dataSource.query(
          `SELECT 1 FROM purchase_order_lines l
             JOIN purchase_orders po ON po.id = l.purchase_order_id
            WHERE l.item_id = $1 AND po.status <> 'cancelled' AND po.is_deleted = false
            LIMIT 1`,
          [itemId],
        );
        return rows.length > 0;
      },
    );
  }
}
