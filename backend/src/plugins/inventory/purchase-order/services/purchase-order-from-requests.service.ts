import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

import {
  PURCHASE_ORDER_CODE_INDEX,
  PURCHASE_ORDER_CODE_PREFIX,
  PURCHASE_ORDER_TABLE,
} from '@plugins/inventory/purchase-order/constants/purchase-order.constant';
import { PurchaseOrderFromRequestsDto } from '@plugins/inventory/purchase-order/dto/purchase-order.dto';
import { PurchaseOrderService } from '@plugins/inventory/purchase-order/services/purchase-order.service';
import { priceOrder } from '@plugins/inventory/purchase-order/utils/purchase-order-pricing';
import { PURCHASE_REQUEST_LABEL } from '@plugins/inventory/purchase-request/constants/purchase-request.constant';
import {
  loadRequestLines,
  type RequestLineState,
} from '@plugins/inventory/purchase-request/utils/purchase-request-quantity.util';
import { createWithDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/** VAT of a purchase order made from requests unless told otherwise (D-10 allows 0/5/8/10). */
const DEFAULT_VAT_RATE = 10;

interface PricedItem {
  id: number;
  code: string;
  name: string;
  unit: string;
  reference_price: string | null;
  is_deleted: boolean;
}

/**
 * Turns open request lines into a draft purchase order for one supplier. The requests' headers
 * are locked `FOR UPDATE` in ascending id (D-04) before their lines are read, so a cancel or a
 * second conversion of the same lines waits and then sees what this one ordered: the quantity
 * per request line is checked against what it still has remaining, under that lock.
 */
@Injectable()
export class PurchaseOrderFromRequestsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: PurchaseOrderService,
  ) {}

  async create(dto: PurchaseOrderFromRequestsDto, actor: AuthUserPayload) {
    const vatRate = dto.vatRate ?? DEFAULT_VAT_RATE;
    const id = await createWithDocumentCode(
      this.dataSource,
      {
        table: PURCHASE_ORDER_TABLE,
        prefix: PURCHASE_ORDER_CODE_PREFIX,
        codeUniqueIndex: PURCHASE_ORDER_CODE_INDEX,
        exhaustedMessage:
          'Could not allocate a purchase order number; please try again.',
      },
      async (manager, code) => {
        const lines = await this.lockedRequestLines(manager, dto);
        await this.lockActiveSupplier(manager, dto.supplierId);
        const items = await this.lockActiveItems(
          manager,
          lines.map(({ line }) => line.itemId),
        );
        const priced = lines.map(({ line, quantity }) => {
          const item = items.get(line.itemId) as PricedItem;
          return {
            line,
            item,
            quantity,
            unitPrice: new Decimal(item.reference_price ?? 0).toFixed(0),
          };
        });
        const totals = priceOrder(
          priced.map((entry) => ({
            quantity: entry.quantity,
            unitPrice: entry.unitPrice,
          })),
          vatRate,
        );

        const [row]: Array<{ id: number }> = await manager.query(
          `INSERT INTO purchase_orders
             (code, supplier_id, vat_rate, subtotal, vat_amount, total, note, status,
              created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $8)
           RETURNING id`,
          [
            code,
            dto.supplierId,
            vatRate,
            totals.subtotal,
            totals.vatAmount,
            totals.total,
            null,
            actor.userId,
          ],
        );
        for (const [index, entry] of priced.entries()) {
          await manager.query(
            `INSERT INTO purchase_order_lines
               (purchase_order_id, line_no, item_id, item_code, item_name, item_unit,
                quantity, unit_price, amount, pr_line_id, source_order_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              row.id,
              index + 1,
              entry.item.id,
              entry.item.code,
              entry.item.name,
              entry.item.unit,
              entry.quantity.toFixed(),
              entry.unitPrice,
              totals.lineAmounts[index],
              entry.line.id,
              entry.line.sourceOrderId,
            ],
          );
        }
        return Number(row.id);
      },
    );
    return this.orders.findOne(id, actor);
  }

  /**
   * The request lines asked for, read again under their requests' locks, each with the quantity
   * taken; more than a line still has remaining, or a cancelled request → 409.
   */
  private async lockedRequestLines(
    manager: EntityManager,
    dto: PurchaseOrderFromRequestsDto,
  ): Promise<Array<{ line: RequestLineState; quantity: Decimal }>> {
    const lineIds = [...new Set(dto.lines.map((line) => line.prLineId))];
    const owners: Array<{ request_id: number }> = await manager.query(
      `SELECT DISTINCT request_id FROM purchase_request_lines WHERE id = ANY($1::int[])`,
      [lineIds],
    );
    const requestIds = owners
      .map((row) => Number(row.request_id))
      .sort((a, b) => a - b);
    const requests: Array<{ id: number; code: string; is_cancelled: boolean }> =
      await manager.query(
        `SELECT id, code, is_cancelled FROM purchase_requests
          WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
        [requestIds],
      );
    const cancelled = requests.find((request) => request.is_cancelled);
    if (cancelled) {
      throw new ConflictException(
        `${PURCHASE_REQUEST_LABEL} ${cancelled.code} is cancelled.`,
      );
    }

    const byId = new Map(
      (await loadRequestLines(manager, requestIds)).map((line) => [
        line.id,
        line,
      ]),
    );
    const taken = new Map<number, Decimal>();
    const picked = dto.lines.map((entry) => {
      const line = byId.get(entry.prLineId);
      if (!line) {
        throw new NotFoundException(
          `Request line ${entry.prLineId} not found.`,
        );
      }
      const quantity = new Decimal(String(entry.quantity));
      taken.set(line.id, (taken.get(line.id) ?? new Decimal(0)).add(quantity));
      return { line, quantity };
    });
    for (const [lineId, quantity] of taken) {
      const line = byId.get(lineId) as RequestLineState;
      if (quantity.greaterThan(line.remaining)) {
        throw new ConflictException(
          `${line.itemCode}: only ${line.remaining.toFixed()} remains to be ordered on that request line.`,
        );
      }
    }
    return picked;
  }

  /** The supplier `FOR SHARE`; 409 if inactive or gone. */
  private async lockActiveSupplier(
    manager: EntityManager,
    supplierId: number,
  ): Promise<void> {
    const [supplier]: Array<{ is_active: boolean; is_deleted: boolean }> =
      await manager.query(
        `SELECT is_active, is_deleted FROM suppliers WHERE id = $1 FOR SHARE`,
        [supplierId],
      );
    if (!supplier) {
      throw new NotFoundException(`Supplier ${supplierId} not found.`);
    }
    if (supplier.is_deleted || !supplier.is_active) {
      throw new ConflictException(
        `Supplier ${supplierId} is inactive or deleted.`,
      );
    }
  }

  /** The items `FOR SHARE` in ascending id; a deleted one → 409. */
  private async lockActiveItems(
    manager: EntityManager,
    itemIds: readonly number[],
  ): Promise<Map<number, PricedItem>> {
    const ids = [...new Set(itemIds)].sort((a, b) => a - b);
    if (ids.length === 0) {
      throw new BadRequestException(
        'A purchase order needs at least one line.',
      );
    }
    const rows: PricedItem[] = await manager.query(
      `SELECT id, code, name, unit, reference_price::text AS reference_price, is_deleted
         FROM items WHERE id = ANY($1::int[]) ORDER BY id FOR SHARE`,
      [ids],
    );
    for (const row of rows) {
      if (row.is_deleted) {
        throw new ConflictException(`Item ${row.code} is deleted.`);
      }
    }
    return new Map(rows.map((row) => [Number(row.id), row]));
  }
}
