import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';

export const STOCK_ITEM_REFERENCE_CHECK = 'inventory-stock';

/** An item with a ledger row or a balance row cannot be deleted: the ledger keeps pointing at it. */
@Injectable()
export class StockItemReferenceService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly referenceChecks: ReferenceCheckRegistry,
  ) {}

  onModuleInit(): void {
    this.referenceChecks.registerItemCheck(
      STOCK_ITEM_REFERENCE_CHECK,
      async (itemId) => {
        const rows: unknown[] = await this.dataSource.query(
          `SELECT 1 FROM stock_balances WHERE item_id = $1
           UNION ALL
           SELECT 1 FROM stock_movements WHERE item_id = $1
           LIMIT 1`,
          [itemId],
        );
        return rows.length > 0;
      },
    );
  }
}
