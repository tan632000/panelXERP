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
import { requireText } from '@plugins/inventory/_shared/utils/text.util';
import { ReservationService } from '@plugins/inventory/material/services/reservation.service';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import { PurchaseOrderStatus } from '@plugins/inventory/purchase-order/enums/purchase-order-status.enum';
import {
  assertPurchaseOrderStatus,
  lockPurchaseOrder,
} from '@plugins/inventory/purchase-order/utils/purchase-order-lock.util';
import { settleReceivedStatus } from '@plugins/inventory/purchase-order/utils/purchase-order-receiving.util';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import {
  StockPostingService,
  type StockPostingLine,
} from '@plugins/inventory/stock/services/stock-posting.service';
import {
  SUPPLIER_RETURN_CODE_INDEX,
  SUPPLIER_RETURN_CODE_PREFIX,
  SUPPLIER_RETURN_DOCUMENT_TYPE,
  SUPPLIER_RETURN_LABEL,
  SUPPLIER_RETURN_REQUEST_KEY_INDEX,
  SUPPLIER_RETURN_TABLE,
} from '@plugins/inventory/supplier-return/constants/supplier-return.constant';
import {
  CreateSupplierReturnDto,
  SupplierReturnFilterDto,
} from '@plugins/inventory/supplier-return/dto/supplier-return.dto';
import {
  createWithDocumentCode,
  yearlyDocumentCode,
} from '@plugins/sales/_shared/utils/sales-document-code.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/** Hidden from an actor without `purchase_price:read`: a storekeeper must not learn the price. */
const LINE_MONEY_KEYS = ['unitCost', 'value', 'referenceValue'] as const;

/** Orders goods were received on: a closed order still takes returns of what it received. */
const RETURNABLE: readonly PurchaseOrderStatus[] = [
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
  PurchaseOrderStatus.RECEIVED,
  PurchaseOrderStatus.CLOSED,
];

export interface SupplierReturnRow {
  id: number;
  code: string;
  purchaseOrderId: number;
  purchaseOrderCode: string;
  supplierName: string;
  reason: string;
  lineCount: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
}

export interface SupplierReturnLineView {
  id: number;
  poLineId: number;
  lineNo: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  quantity: number;
  unitCost: number;
  value: number;
  referenceValue: number;
}

/** A return as the post answers it: `created` is false when the request key was seen before. */
export interface SupplierReturnPostResult {
  created: boolean;
  supplierReturn: Awaited<ReturnType<SupplierReturnService['findOne']>>;
}

interface Posted {
  id: number;
  orderIds: number[];
  itemIds: number[];
}

interface PurchaseOrderLineState {
  id: number;
  item_id: number;
  item_code: string;
  received_qty: string;
  unit_price: string;
}

type RawRow = Record<string, unknown>;

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const HEADER_COLUMNS = `r.*, po.code AS purchase_order_code, s.name AS supplier_name,
         u.full_name AS created_by_name,
         (SELECT COUNT(*) FROM stock_supplier_return_lines l WHERE l.return_id = r.id) AS line_count`;
const HEADER_FROM = `FROM stock_supplier_returns r
    JOIN purchase_orders po ON po.id = r.purchase_order_id
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN users u ON u.id = r.created_by`;

/**
 * Goods sent back to the supplier against the purchase order line they came on. A post runs in
 * one transaction that takes the order header `FOR UPDATE` first, inserts the return header
 * with its request key at once — before any check — then lowers the line's received quantity,
 * shrinks the reservations stock no longer covers (lowest priority first) and posts the stock
 * out at the purchase price (D-06).
 */
@Injectable()
export class SupplierReturnService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly posting: StockPostingService,
    private readonly reservations: ReservationService,
    private readonly shortageAlerts: ShortageAlertService,
  ) {}

  async findAll(query: SupplierReturnFilterDto) {
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
    if (!head) {
      throw new NotFoundException(`${SUPPLIER_RETURN_LABEL} not found`);
    }
    const lines: RawRow[] = await this.dataSource.query(
      `SELECT l.*, pl.line_no, pl.item_code, pl.item_name, pl.item_unit
         FROM stock_supplier_return_lines l
         JOIN purchase_order_lines pl ON pl.id = l.po_line_id
        WHERE l.return_id = $1
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
   * Posts a return numbered `XT_YYYY_NNNN`. A request key already stored answers the first
   * return and posts nothing; a twin that committed while this one waited on the order lock is
   * caught by the request key index instead. Alerts go out after the commit.
   */
  async create(
    dto: CreateSupplierReturnDto,
    actor: AuthUserPayload,
  ): Promise<SupplierReturnPostResult> {
    const reason = requireText(dto.reason, 'Reason is required.');
    const stored = await this.storedReturnId(
      this.dataSource.manager,
      dto.requestKey,
    );
    if (stored) return this.replay(stored, actor);

    let posted: Posted;
    try {
      posted = await createWithDocumentCode(
        this.dataSource,
        {
          table: SUPPLIER_RETURN_TABLE,
          prefix: SUPPLIER_RETURN_CODE_PREFIX,
          codeUniqueIndex: SUPPLIER_RETURN_CODE_INDEX,
          exhaustedMessage:
            'Could not allocate a supplier return number; please try again.',
          // The order header is the first lock (D-04), taken before the number is read: two
          // returns of one order read their numbers one after the other instead of colliding.
          format: async (context) => {
            await lockPurchaseOrder(context.manager, dto.purchaseOrderId);
            return yearlyDocumentCode(context);
          },
        },
        (manager, code) => this.post(manager, code, dto, reason, actor),
      );
    } catch (error: unknown) {
      if (!isUniqueViolationOn(error, [SUPPLIER_RETURN_REQUEST_KEY_INDEX])) {
        throw error;
      }
      const twin = await this.storedReturnId(
        this.dataSource.manager,
        dto.requestKey,
      );
      if (!twin) throw error;
      return this.replay(twin, actor);
    }

    await this.shortageAlerts.afterCommit(posted.orderIds, posted.itemIds);
    return {
      created: true,
      supplierReturn: await this.findOne(posted.id, actor),
    };
  }

  private async replay(
    id: number,
    actor: AuthUserPayload,
  ): Promise<SupplierReturnPostResult> {
    return { created: false, supplierReturn: await this.findOne(id, actor) };
  }

  private async post(
    manager: EntityManager,
    code: string,
    dto: CreateSupplierReturnDto,
    reason: string,
    actor: AuthUserPayload,
  ): Promise<Posted> {
    // Already held since the number was read; this reads the header under that lock.
    const order = await lockPurchaseOrder(manager, dto.purchaseOrderId);
    // Straight after the order lock and before any check: a twin carrying the same request key
    // waits on the lock, then fails on the request key index instead of on a check.
    const [header]: Array<{ id: number }> = await manager.query(
      `INSERT INTO stock_supplier_returns (code, purchase_order_id, reason, request_key, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [code, order.id, reason, dto.requestKey ?? null, actor.userId],
    );
    assertPurchaseOrderStatus(order, RETURNABLE, 'returned to the supplier');

    const poLines: PurchaseOrderLineState[] = await manager.query(
      `SELECT id, item_id, item_code, received_qty::text AS received_qty,
              unit_price::text AS unit_price
         FROM purchase_order_lines WHERE purchase_order_id = $1`,
      [order.id],
    );
    const byId = new Map(poLines.map((line) => [line.id, line]));
    const perLine = new Map<number, Decimal>();
    const quantities = dto.lines.map((line) => {
      if (!byId.has(line.poLineId)) {
        throw new BadRequestException(
          `Line ${line.poLineId} is not on ${order.code}.`,
        );
      }
      const quantity = new Decimal(String(line.quantity));
      perLine.set(
        line.poLineId,
        (perLine.get(line.poLineId) ?? new Decimal(0)).add(quantity),
      );
      return quantity;
    });
    for (const [poLineId, quantity] of perLine) {
      const line = byId.get(poLineId) as PurchaseOrderLineState;
      if (quantity.greaterThan(line.received_qty)) {
        throw new ConflictException(
          `${line.item_code}: only ${new Decimal(line.received_qty).toFixed()} received on ${order.code} can go back.`,
        );
      }
      await manager.query(
        `UPDATE purchase_order_lines SET received_qty = received_qty - $2 WHERE id = $1`,
        [poLineId, quantity.toFixed()],
      );
    }
    // A closed order stays closed: what it no longer has is never expected again (D-11).
    if (order.status !== PurchaseOrderStatus.CLOSED) {
      await settleReceivedStatus(manager, order, actor.userId);
    }

    const perItem = new Map<number, Decimal>();
    for (const [index, line] of dto.lines.entries()) {
      const itemId = (byId.get(line.poLineId) as PurchaseOrderLineState)
        .item_id;
      perItem.set(
        itemId,
        (perItem.get(itemId) ?? new Decimal(0)).add(quantities[index]),
      );
    }
    const itemIds = [...perItem.keys()].sort((a, b) => a - b);
    const stock = await this.posting.lockBalances(manager, itemIds);
    const changedOrders = new Set<number>();
    for (const itemId of itemIds) {
      const balance = stock.get(itemId);
      if (!balance) throw new NotFoundException(`Item ${itemId} not found.`);
      const left = balance.onHand.sub(perItem.get(itemId) as Decimal);
      if (left.isNegative()) {
        throw new ConflictException(
          `${balance.code}: only ${balance.onHand.toFixed()} on hand to return.`,
        );
      }
      // Stock no longer covers what is set aside: the lowest priority gives back first.
      if (left.lessThan(balance.reserved)) {
        const shrunk = await this.reservations.deallocate(
          manager,
          itemId,
          left,
        );
        for (const orderId of shrunk.orderIds) changedOrders.add(orderId);
      }
    }

    const postingLines: StockPostingLine[] = [];
    for (const [index, line] of dto.lines.entries()) {
      const poLine = byId.get(line.poLineId) as PurchaseOrderLineState;
      const [row]: Array<{ id: number }> = await manager.query(
        `INSERT INTO stock_supplier_return_lines (return_id, po_line_id, item_id, quantity, unit_cost)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          header.id,
          poLine.id,
          poLine.item_id,
          quantities[index].toFixed(),
          poLine.unit_price,
        ],
      );
      postingLines.push({
        itemId: poLine.item_id,
        movementType: StockMovementType.SUPPLIER_RETURN,
        quantity: quantities[index].negated().toFixed(),
        unitCost: poLine.unit_price,
        documentLineId: row.id,
      });
    }
    const result = await this.posting.post(manager, {
      documentType: SUPPLIER_RETURN_DOCUMENT_TYPE,
      documentId: header.id,
      lines: postingLines,
      actorId: actor.userId,
    });
    await manager.query(
      `UPDATE stock_supplier_return_lines l
          SET value = m.value, reference_value = m.reference_value
         FROM stock_movements m
        WHERE l.return_id = $1 AND m.document_type = $2 AND m.document_id = $1
          AND m.document_line_id = l.id`,
      [header.id, SUPPLIER_RETURN_DOCUMENT_TYPE],
    );
    return {
      id: header.id,
      orderIds: [...changedOrders].sort((a, b) => a - b),
      itemIds: result.itemIds,
    };
  }

  private async storedReturnId(
    manager: EntityManager,
    requestKey: string | undefined,
  ): Promise<number | null> {
    if (!requestKey) return null;
    const [row]: Array<{ id: number }> = await manager.query(
      `SELECT id FROM stock_supplier_returns WHERE request_key = $1`,
      [requestKey],
    );
    return row ? Number(row.id) : null;
  }

  private toRow(row: RawRow): SupplierReturnRow {
    return {
      id: Number(row.id),
      code: String(row.code),
      purchaseOrderId: Number(row.purchase_order_id),
      purchaseOrderCode: String(row.purchase_order_code),
      supplierName: String(row.supplier_name),
      reason: String(row.reason),
      lineCount: Number(row.line_count),
      createdBy: row.created_by === null ? null : Number(row.created_by),
      createdByName: textOrNull(row.created_by_name),
      createdAt: row.created_at as Date,
    };
  }

  private toLine(row: RawRow): SupplierReturnLineView {
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
      value: Number(row.value),
      referenceValue: Number(row.reference_value),
    };
  }
}
