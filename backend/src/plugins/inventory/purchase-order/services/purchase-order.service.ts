import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { resolvePagination } from '@shared/utils/pagination.util';
import { escapeLikePattern } from '@shared/utils/typeorm-search.util';

import { withoutCosts } from '@plugins/inventory/_shared/utils/purchase-price.util';
import { trimToNull } from '@plugins/inventory/_shared/utils/text.util';
import {
  PURCHASE_ORDER_CODE_INDEX,
  PURCHASE_ORDER_CODE_PREFIX,
  PURCHASE_ORDER_LABEL,
  PURCHASE_ORDER_TABLE,
} from '@plugins/inventory/purchase-order/constants/purchase-order.constant';
import { PurchaseOrderFilterDto } from '@plugins/inventory/purchase-order/dto/purchase-order-filter.dto';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderLineDto,
  UpdatePurchaseOrderDto,
} from '@plugins/inventory/purchase-order/dto/purchase-order.dto';
import { PurchaseOrderStatus } from '@plugins/inventory/purchase-order/enums/purchase-order-status.enum';
import {
  assertPurchaseOrderStatus,
  lockPurchaseOrder,
} from '@plugins/inventory/purchase-order/utils/purchase-order-lock.util';
import {
  priceOrder,
  type PurchaseOrderTotals,
} from '@plugins/inventory/purchase-order/utils/purchase-order-pricing';
import { createWithDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { PurchaseOrderEventType } from '@plugins/inventory/purchase-order/enums/purchase-order-event.enum';
import type { EntityManager } from 'typeorm';

/** Hidden from an actor without `purchase_price:read`: a storekeeper must not learn the price. */
const HEADER_MONEY_KEYS = [
  'vatRate',
  'subtotal',
  'vatAmount',
  'total',
] as const;
const LINE_MONEY_KEYS = ['unitPrice', 'amount'] as const;

export interface PurchaseOrderRow {
  id: number;
  code: string;
  supplierId: number;
  supplierCode: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  expectedDate: string | null;
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  note: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
}

export interface PurchaseOrderLineView {
  id: number;
  lineNo: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  receivedQty: number;
}

export interface PurchaseOrderEventView {
  id: number;
  event: PurchaseOrderEventType;
  actorId: number;
  actorName: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface PurchaseOrderDetail extends PurchaseOrderRow {
  /** Everyone barred from approving: the creator, the submitter and every editor. */
  editorIds: number[];
  submittedBy: number | null;
  approvedBy: number | null;
  cancelReason: string | null;
  closeReason: string | null;
  lines: PurchaseOrderLineView[];
  events: PurchaseOrderEventView[];
}

/** A raw `pg` row: `numeric` arrives as text, timestamps as dates. */
type RawRow = Record<string, unknown>;

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const dateOrNull = (value: unknown): Date | null =>
  value instanceof Date ? value : null;
/** A `date` column arrives as text (`YYYY-MM-DD`) or as a date at local midnight. */
const dateOnly = (value: unknown): string | null => {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return null;
};

const HEADER_COLUMNS = `po.*, s.code AS supplier_code, s.name AS supplier_name,
         u.full_name AS created_by_name`;
const HEADER_FROM = `FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN users u ON u.id = po.created_by`;

interface LockedItem {
  id: number;
  code: string;
  name: string;
  unit: string;
}

/**
 * Purchase orders while they are drafts: list, read, create and edit. The decisions
 * (submit, approve, reject, cancel, close) are `PurchaseOrderApprovalService`.
 */
@Injectable()
export class PurchaseOrderService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(query: PurchaseOrderFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const conditions = ['po.is_deleted = false'];
    const params: unknown[] = [];
    if (query.status) {
      params.push(query.status);
      conditions.push(`po.status = $${params.length}`);
    }
    if (query.supplierId) {
      params.push(query.supplierId);
      conditions.push(`po.supplier_id = $${params.length}`);
    }
    const search = query.search?.trim();
    if (search) {
      params.push(`%${escapeLikePattern(search)}%`);
      conditions.push(
        `(erp_unaccent(po.code) ILIKE erp_unaccent($${params.length})
          OR erp_unaccent(s.code) ILIKE erp_unaccent($${params.length})
          OR erp_unaccent(s.name) ILIKE erp_unaccent($${params.length}))`,
      );
    }
    params.push(take, skip);

    const rows: RawRow[] = await this.dataSource.query(
      `SELECT ${HEADER_COLUMNS}, COUNT(*) OVER () AS total_rows
       ${HEADER_FROM}
       WHERE ${conditions.join(' AND ')}
       ORDER BY po.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = rows.length > 0 ? Number(rows[0].total_rows) : 0;
    const data = rows.map((row) =>
      withoutCosts(this.toRow(row), HEADER_MONEY_KEYS, actor),
    );
    return paginate(data, total, page, limit);
  }

  async findOne(id: number, actor: AuthUserPayload) {
    const [head]: RawRow[] = await this.dataSource.query(
      `SELECT ${HEADER_COLUMNS} ${HEADER_FROM}
        WHERE po.id = $1 AND po.is_deleted = false`,
      [id],
    );
    if (!head) throw new NotFoundException(`${PURCHASE_ORDER_LABEL} not found`);

    const lines: RawRow[] = await this.dataSource.query(
      `SELECT * FROM purchase_order_lines
        WHERE purchase_order_id = $1 ORDER BY line_no, id`,
      [id],
    );
    const events: RawRow[] = await this.dataSource.query(
      `SELECT e.*, u.full_name AS actor_name
         FROM purchase_order_events e
         LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.purchase_order_id = $1
        ORDER BY e.id`,
      [id],
    );

    const detail: PurchaseOrderDetail = {
      ...this.toRow(head),
      editorIds: Array.isArray(head.editor_ids)
        ? (head.editor_ids as unknown[]).map(Number)
        : [],
      submittedBy: numberOrNull(head.submitted_by),
      approvedBy: numberOrNull(head.approved_by),
      cancelReason: textOrNull(head.cancel_reason),
      closeReason: textOrNull(head.close_reason),
      lines: lines.map((line) =>
        withoutCosts(this.toLine(line), LINE_MONEY_KEYS, actor),
      ) as PurchaseOrderLineView[],
      events: events.map((event) => ({
        id: Number(event.id),
        event: event.event as PurchaseOrderEventType,
        actorId: Number(event.actor_id),
        actorName: textOrNull(event.actor_name),
        reason: textOrNull(event.reason),
        createdAt: event.created_at as Date,
      })),
    };
    return withoutCosts(detail, HEADER_MONEY_KEYS, actor);
  }

  /** A new draft numbered `PO_YYYY_NNNN`; a lost race on the number retries the whole insert. */
  async create(dto: CreatePurchaseOrderDto, actor: AuthUserPayload) {
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
        await this.lockActiveSupplier(manager, dto.supplierId);
        const items = await this.lockActiveItems(manager, dto.lines);
        const totals = priceOrder(dto.lines, dto.vatRate);

        const [row]: Array<{ id: number }> = await manager.query(
          `INSERT INTO purchase_orders
             (code, supplier_id, expected_date, vat_rate, subtotal, vat_amount, total,
              note, status, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $9)
           RETURNING id`,
          [
            code,
            dto.supplierId,
            dto.expectedDate ?? null,
            dto.vatRate,
            totals.subtotal,
            totals.vatAmount,
            totals.total,
            trimToNull(dto.note),
            actor.userId,
          ],
        );
        await this.insertLines(manager, row.id, dto.lines, items, totals);
        return row.id;
      },
    );
    return this.findOne(id, actor);
  }

  /**
   * Edits a draft. The actor joins `editor_ids` and so can no longer approve it; the totals are
   * recomputed from the lines as stored after the edit.
   */
  async update(
    id: number,
    dto: UpdatePurchaseOrderDto,
    actor: AuthUserPayload,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const order = await lockPurchaseOrder(manager, id);
      assertPurchaseOrderStatus(order, [PurchaseOrderStatus.DRAFT], 'edited');

      const supplierId = dto.supplierId ?? order.supplierId;
      if (dto.supplierId !== undefined) {
        await this.lockActiveSupplier(manager, supplierId);
      }
      const vatRate = dto.vatRate ?? order.vatRate;

      let totals: PurchaseOrderTotals;
      if (dto.lines) {
        const items = await this.lockActiveItems(manager, dto.lines);
        totals = priceOrder(dto.lines, vatRate);
        await manager.query(
          `DELETE FROM purchase_order_lines WHERE purchase_order_id = $1`,
          [id],
        );
        await this.insertLines(manager, id, dto.lines, items, totals);
      } else {
        const stored: Array<{ quantity: string; unitPrice: string }> =
          await manager.query(
            `SELECT quantity::text AS quantity, unit_price::text AS "unitPrice"
               FROM purchase_order_lines WHERE purchase_order_id = $1`,
            [id],
          );
        totals = priceOrder(stored, vatRate);
      }

      const result: [unknown[], number] = await manager.query(
        `UPDATE purchase_orders
            SET supplier_id = $3, expected_date = $4, vat_rate = $5,
                subtotal = $6, vat_amount = $7, total = $8, note = $9,
                editor_ids = CASE WHEN $10::int = ANY(editor_ids) THEN editor_ids
                                  ELSE array_append(editor_ids, $10::int) END,
                updated_by = $10::int, updated_at = NOW()
          WHERE id = $1 AND status = $2`,
        [
          id,
          PurchaseOrderStatus.DRAFT,
          supplierId,
          dto.expectedDate !== undefined
            ? dto.expectedDate
            : (order.expectedDate ?? null),
          vatRate,
          totals.subtotal,
          totals.vatAmount,
          totals.total,
          dto.note !== undefined ? trimToNull(dto.note) : (order.note ?? null),
          actor.userId,
        ],
      );
      if (result[1] !== 1) {
        throw new ConflictException(
          `${PURCHASE_ORDER_LABEL} ${order.code} changed while it was being edited.`,
        );
      }
    });
    return this.findOne(id, actor);
  }

  /** The supplier `FOR SHARE` (a delete locks it `FOR UPDATE` first, then sees this order); 409 if inactive or gone. */
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

  /**
   * The ordered items `FOR SHARE` in ascending id (the global lock order), so none can be
   * deleted under the order: unknown → 404, deleted → 409.
   */
  private async lockActiveItems(
    manager: EntityManager,
    lines: readonly PurchaseOrderLineDto[],
  ): Promise<Map<number, LockedItem>> {
    const ids = [...new Set(lines.map((line) => line.itemId))].sort(
      (a, b) => a - b,
    );
    if (ids.length === 0) return new Map();
    const rows: Array<LockedItem & { is_deleted: boolean }> =
      await manager.query(
        `SELECT id, code, name, unit, is_deleted FROM items
          WHERE id = ANY($1::int[]) ORDER BY id FOR SHARE`,
        [ids],
      );
    const found = new Map(rows.map((row) => [row.id, row]));
    for (const id of ids) {
      const item = found.get(id);
      if (!item) throw new NotFoundException(`Item ${id} not found.`);
      if (item.is_deleted) {
        throw new ConflictException(`Item ${item.code} is deleted.`);
      }
    }
    return found;
  }

  private async insertLines(
    manager: EntityManager,
    orderId: number,
    lines: readonly PurchaseOrderLineDto[],
    items: Map<number, LockedItem>,
    totals: { lineAmounts: string[] },
  ): Promise<void> {
    for (const [index, line] of lines.entries()) {
      const item = items.get(line.itemId) as LockedItem;
      await manager.query(
        `INSERT INTO purchase_order_lines
           (purchase_order_id, line_no, item_id, item_code, item_name, item_unit,
            quantity, unit_price, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          orderId,
          index + 1,
          item.id,
          item.code,
          item.name,
          item.unit,
          String(line.quantity),
          String(line.unitPrice),
          totals.lineAmounts[index],
        ],
      );
    }
  }

  private toRow(row: RawRow): PurchaseOrderRow {
    return {
      id: Number(row.id),
      code: String(row.code),
      supplierId: Number(row.supplier_id),
      supplierCode: String(row.supplier_code),
      supplierName: String(row.supplier_name),
      status: row.status as PurchaseOrderStatus,
      expectedDate: dateOnly(row.expected_date),
      vatRate: Number(row.vat_rate),
      subtotal: Number(row.subtotal),
      vatAmount: Number(row.vat_amount),
      total: Number(row.total),
      note: textOrNull(row.note),
      createdBy: numberOrNull(row.created_by),
      createdByName: textOrNull(row.created_by_name),
      createdAt: row.created_at as Date,
      submittedAt: dateOrNull(row.submitted_at),
      approvedAt: dateOrNull(row.approved_at),
    };
  }

  private toLine(row: RawRow): PurchaseOrderLineView {
    return {
      id: Number(row.id),
      lineNo: Number(row.line_no),
      itemId: Number(row.item_id),
      itemCode: String(row.item_code),
      itemName: String(row.item_name),
      itemUnit: String(row.item_unit),
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
      amount: Number(row.amount),
      receivedQty: Number(row.received_qty),
    };
  }
}
