import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { isUniqueViolationOn } from '@shared/utils/db-error.util';
import { resolvePagination } from '@shared/utils/pagination.util';
import { escapeLikePattern } from '@shared/utils/typeorm-search.util';

import { withoutCosts } from '@plugins/inventory/_shared/utils/purchase-price.util';
import { trimToNull } from '@plugins/inventory/_shared/utils/text.util';
import { ReservationService } from '@plugins/inventory/material/services/reservation.service';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import { PurchaseOrderStatus } from '@plugins/inventory/purchase-order/enums/purchase-order-status.enum';
import {
  assertPurchaseOrderStatus,
  lockPurchaseOrder,
} from '@plugins/inventory/purchase-order/utils/purchase-order-lock.util';
import { settleReceivedStatus } from '@plugins/inventory/purchase-order/utils/purchase-order-receiving.util';
import {
  STOCK_RECEIPT_CODE_INDEX,
  STOCK_RECEIPT_CODE_PREFIX,
  STOCK_RECEIPT_DOCUMENT_TYPE,
  STOCK_RECEIPT_LABEL,
  STOCK_RECEIPT_REQUEST_KEY_INDEX,
  STOCK_RECEIPT_TABLE,
} from '@plugins/inventory/receipt/constants/receipt.constant';
import { StockReceiptFilterDto } from '@plugins/inventory/receipt/dto/stock-receipt-filter.dto';
import { CreateStockReceiptDto } from '@plugins/inventory/receipt/dto/stock-receipt.dto';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import {
  StockPostingService,
  type StockPostingLine,
} from '@plugins/inventory/stock/services/stock-posting.service';
import {
  createWithDocumentCode,
  yearlyDocumentCode,
} from '@plugins/sales/_shared/utils/sales-document-code.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/** Hidden from an actor without `purchase_price:read`: a storekeeper must not learn the price. */
const LINE_MONEY_KEYS = ['unitCost'] as const;

/** The purchase order statuses goods may still be received on. */
const RECEIVABLE: readonly PurchaseOrderStatus[] = [
  PurchaseOrderStatus.APPROVED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

export interface StockReceiptRow {
  id: number;
  code: string;
  purchaseOrderId: number;
  purchaseOrderCode: string;
  supplierName: string;
  note: string | null;
  lineCount: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
}

export interface StockReceiptLineView {
  id: number;
  poLineId: number;
  lineNo: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  quantity: number;
  unitCost: number;
}

/** A receipt as the post answers it: `created` is false when the request key was seen before. */
export interface StockReceiptPostResult {
  created: boolean;
  receipt: Awaited<ReturnType<StockReceiptService['findOne']>>;
}

/** A raw `pg` row: `numeric` arrives as text, timestamps as dates. */
type RawRow = Record<string, unknown>;

interface PurchaseOrderLineState {
  id: number;
  item_id: number;
  item_code: string;
  quantity: string;
  received_qty: string;
  unit_price: string;
  source_order_id: number | null;
}

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const HEADER_COLUMNS = `r.*, po.code AS purchase_order_code, s.name AS supplier_name,
         u.full_name AS created_by_name,
         (SELECT COUNT(*) FROM stock_receipt_lines l WHERE l.receipt_id = r.id) AS line_count`;
const HEADER_FROM = `FROM stock_receipts r
    JOIN purchase_orders po ON po.id = r.purchase_order_id
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN users u ON u.id = r.created_by`;

/**
 * Goods received against approved purchase orders. A post runs in one transaction that takes
 * the purchase order header `FOR UPDATE` first, inserts the receipt header with its request key
 * at once — before any check — then checks every line against the order's remaining quantity,
 * posts the stock at the order's prices and hands the new stock to the short orders, the order's
 * source orders first. Receipts are never edited.
 */
@Injectable()
export class StockReceiptService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly posting: StockPostingService,
    private readonly reservations: ReservationService,
    private readonly shortageAlerts: ShortageAlertService,
  ) {}

  async findAll(query: StockReceiptFilterDto) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const conditions = ['TRUE'];
    const params: unknown[] = [];
    if (query.purchaseOrderId) {
      params.push(query.purchaseOrderId);
      conditions.push(`r.purchase_order_id = $${params.length}`);
    }
    const search = query.search?.trim();
    if (search) {
      params.push(`%${escapeLikePattern(search)}%`);
      conditions.push(
        `(erp_unaccent(r.code) ILIKE erp_unaccent($${params.length})
          OR erp_unaccent(po.code) ILIKE erp_unaccent($${params.length})
          OR erp_unaccent(s.name) ILIKE erp_unaccent($${params.length}))`,
      );
    }
    params.push(take, skip);

    const rows: RawRow[] = await this.dataSource.query(
      `SELECT ${HEADER_COLUMNS}, COUNT(*) OVER () AS total_rows
       ${HEADER_FROM}
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = rows.length > 0 ? Number(rows[0].total_rows) : 0;
    return paginate(
      rows.map((row) => this.toRow(row)),
      total,
      page,
      limit,
    );
  }

  async findOne(id: number, actor: AuthUserPayload) {
    const [head]: RawRow[] = await this.dataSource.query(
      `SELECT ${HEADER_COLUMNS} ${HEADER_FROM} WHERE r.id = $1`,
      [id],
    );
    if (!head) throw new NotFoundException(`${STOCK_RECEIPT_LABEL} not found`);

    const lines: RawRow[] = await this.dataSource.query(
      `SELECT l.*, pl.line_no, pl.item_code, pl.item_name, pl.item_unit
         FROM stock_receipt_lines l
         JOIN purchase_order_lines pl ON pl.id = l.po_line_id
        WHERE l.receipt_id = $1
        ORDER BY pl.line_no, l.id`,
      [id],
    );
    return {
      ...this.toRow(head),
      lines: lines.map((line) =>
        withoutCosts(this.toLine(line), LINE_MONEY_KEYS, actor),
      ),
    };
  }

  /**
   * Posts a receipt numbered `NK_YYYY_NNNN`. A request key already stored answers the first
   * receipt and posts nothing; a twin that committed while this one waited on the order lock is
   * caught by the request key index instead. Alerts go out after the commit, outside the
   * retried work.
   */
  async create(
    dto: CreateStockReceiptDto,
    actor: AuthUserPayload,
  ): Promise<StockReceiptPostResult> {
    const stored = await this.storedReceiptId(
      this.dataSource.manager,
      dto.requestKey,
    );
    if (stored) return this.replay(stored, actor);

    let posted: { id: number; orderIds: number[]; itemIds: number[] };
    try {
      posted = await createWithDocumentCode(
        this.dataSource,
        {
          table: STOCK_RECEIPT_TABLE,
          prefix: STOCK_RECEIPT_CODE_PREFIX,
          codeUniqueIndex: STOCK_RECEIPT_CODE_INDEX,
          exhaustedMessage:
            'Could not allocate a stock receipt number; please try again.',
          // The order header is the first lock (D-04), taken before the number is read: two
          // receipts of one order then read their numbers one after the other instead of
          // colliding, so the second one's checks run once, on what the first committed.
          format: async (context) => {
            await lockPurchaseOrder(context.manager, dto.purchaseOrderId);
            return yearlyDocumentCode(context);
          },
        },
        (manager, code) => this.post(manager, code, dto, actor),
      );
    } catch (error: unknown) {
      if (!isUniqueViolationOn(error, [STOCK_RECEIPT_REQUEST_KEY_INDEX])) {
        throw error;
      }
      const twin = await this.storedReceiptId(
        this.dataSource.manager,
        dto.requestKey,
      );
      if (!twin) throw error;
      return this.replay(twin, actor);
    }

    await this.shortageAlerts.afterCommit(posted.orderIds, posted.itemIds);
    return { created: true, receipt: await this.findOne(posted.id, actor) };
  }

  private async replay(
    id: number,
    actor: AuthUserPayload,
  ): Promise<StockReceiptPostResult> {
    return { created: false, receipt: await this.findOne(id, actor) };
  }

  private async post(
    manager: EntityManager,
    code: string,
    dto: CreateStockReceiptDto,
    actor: AuthUserPayload,
  ): Promise<{ id: number; orderIds: number[]; itemIds: number[] }> {
    // Already held since the number was read; this reads the header under that lock.
    const order = await lockPurchaseOrder(manager, dto.purchaseOrderId);
    // Straight after the order lock and before any check: a twin carrying the same request key
    // waits on the lock above, then fails on the request key index instead of on a check.
    const [header]: Array<{ id: number }> = await manager.query(
      `INSERT INTO stock_receipts (code, purchase_order_id, note, request_key, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        code,
        order.id,
        trimToNull(dto.note),
        dto.requestKey ?? null,
        actor.userId,
      ],
    );
    assertPurchaseOrderStatus(order, RECEIVABLE, 'received');

    const poLines: PurchaseOrderLineState[] = await manager.query(
      `SELECT id, item_id, item_code, quantity::text AS quantity,
              received_qty::text AS received_qty, unit_price::text AS unit_price,
              source_order_id
         FROM purchase_order_lines WHERE purchase_order_id = $1`,
      [order.id],
    );
    const byId = new Map(poLines.map((line) => [line.id, line]));

    // Summed per order line first: two lines of one request on the same order line share its
    // remaining quantity.
    const wanted = new Map<number, Decimal>();
    for (const line of dto.lines) {
      const quantity = new Decimal(String(line.quantity));
      if (quantity.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Quantity must be greater than 0.');
      }
      if (!byId.has(line.poLineId)) {
        throw new BadRequestException(
          `Line ${line.poLineId} is not on ${order.code}.`,
        );
      }
      wanted.set(
        line.poLineId,
        (wanted.get(line.poLineId) ?? new Decimal(0)).add(quantity),
      );
    }
    for (const [poLineId, quantity] of wanted) {
      const line = byId.get(poLineId) as PurchaseOrderLineState;
      const remaining = new Decimal(line.quantity).sub(line.received_qty);
      if (quantity.greaterThan(remaining)) {
        throw new ConflictException(
          `${line.item_code}: only ${remaining.toFixed()} remain to be received on ${order.code}.`,
        );
      }
      await manager.query(
        `UPDATE purchase_order_lines SET received_qty = received_qty + $2 WHERE id = $1`,
        [poLineId, quantity.toFixed()],
      );
    }
    await settleReceivedStatus(manager, order, actor.userId);

    const postingLines: StockPostingLine[] = [];
    for (const line of dto.lines) {
      const poLine = byId.get(line.poLineId) as PurchaseOrderLineState;
      const quantity = new Decimal(String(line.quantity)).toFixed();
      const [row]: Array<{ id: number }> = await manager.query(
        `INSERT INTO stock_receipt_lines (receipt_id, po_line_id, item_id, quantity, unit_cost)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [header.id, poLine.id, poLine.item_id, quantity, poLine.unit_price],
      );
      postingLines.push({
        itemId: poLine.item_id,
        movementType: StockMovementType.RECEIPT,
        quantity,
        unitCost: poLine.unit_price,
        documentLineId: row.id,
      });
    }
    const stock = await this.posting.post(manager, {
      documentType: STOCK_RECEIPT_DOCUMENT_TYPE,
      documentId: header.id,
      lines: postingLines,
      actorId: actor.userId,
    });

    // The orders this purchase was made for take the new stock before any other short order.
    const sourceOrderIds = [
      ...new Set(
        dto.lines
          .map((line) => byId.get(line.poLineId)?.source_order_id)
          .filter((id): id is number => typeof id === 'number'),
      ),
    ].sort((a, b) => a - b);
    const allocated = await this.reservations.allocate(
      manager,
      stock.itemIds,
      sourceOrderIds,
    );
    return {
      id: header.id,
      orderIds: allocated.orderIds,
      itemIds: stock.itemIds,
    };
  }

  private async storedReceiptId(
    manager: EntityManager,
    requestKey: string | undefined,
  ): Promise<number | null> {
    if (!requestKey) return null;
    const [row]: Array<{ id: number }> = await manager.query(
      `SELECT id FROM stock_receipts WHERE request_key = $1`,
      [requestKey],
    );
    return row ? Number(row.id) : null;
  }

  private toRow(row: RawRow): StockReceiptRow {
    return {
      id: Number(row.id),
      code: String(row.code),
      purchaseOrderId: Number(row.purchase_order_id),
      purchaseOrderCode: String(row.purchase_order_code),
      supplierName: String(row.supplier_name),
      note: textOrNull(row.note),
      lineCount: Number(row.line_count),
      createdBy: numberOrNull(row.created_by),
      createdByName: textOrNull(row.created_by_name),
      createdAt: row.created_at as Date,
    };
  }

  private toLine(row: RawRow): StockReceiptLineView {
    return {
      id: Number(row.id),
      poLineId: Number(row.po_line_id),
      lineNo: Number(row.line_no),
      itemId: Number(row.item_id),
      itemCode: String(row.item_code),
      itemName: String(row.item_name),
      itemUnit: String(row.item_unit),
      quantity: Number(row.quantity),
      unitCost: Number(row.unit_cost),
    };
  }
}
