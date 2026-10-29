import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import { PURCHASE_REQUEST_REFERENCE_CHECK } from '@plugins/inventory/purchase-request/constants/purchase-request.constant';

/** A request that is not cancelled vetoes deleting an item on one of its lines. */
@Injectable()
export class PurchaseRequestReferenceService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly itemChecks: ReferenceCheckRegistry,
  ) {}

  onModuleInit(): void {
    this.itemChecks.registerItemCheck(
      PURCHASE_REQUEST_REFERENCE_CHECK,
      async (itemId) => {
        const rows: unknown[] = await this.dataSource.query(
          `SELECT 1 FROM purchase_request_lines l
             JOIN purchase_requests r ON r.id = l.request_id
            WHERE l.item_id = $1 AND r.is_cancelled = false
            LIMIT 1`,
          [itemId],
        );
        return rows.length > 0;
      },
    );
  }
}
