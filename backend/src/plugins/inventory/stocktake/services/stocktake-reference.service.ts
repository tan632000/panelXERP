import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { STOCKTAKE_REFERENCE_CHECK } from '@plugins/inventory/stocktake/constants/stocktake.constant';

/** An open count vetoes deleting an item on one of its lines: the count would lose a line. */
@Injectable()
export class StocktakeReferenceService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly itemChecks: ReferenceCheckRegistry,
  ) {}

  onModuleInit(): void {
    this.itemChecks.registerItemCheck(
      STOCKTAKE_REFERENCE_CHECK,
      async (itemId) => {
        const rows: unknown[] = await this.dataSource.query(
          `SELECT 1 FROM stocktake_lines sl
             JOIN stocktakes t ON t.id = sl.stocktake_id
            WHERE sl.item_id = $1 AND t.status IN ('counting', 'submitted')
            LIMIT 1`,
          [itemId],
        );
        return rows.length > 0;
      },
    );
  }
}
