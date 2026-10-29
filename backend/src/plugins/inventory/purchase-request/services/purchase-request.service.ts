import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

import { DEFAULT_LIST_PAGE_SIZE } from '@shared/constants/pagination';
import { paginate } from '@shared/dto/pagination.dto';
import { DataScopeService } from '@shared/services/data-scope.service';
import { resolvePagination } from '@shared/utils/pagination.util';
import { escapeLikePattern } from '@shared/utils/typeorm-search.util';

import {
  requireText,
  trimToNull,
} from '@plugins/inventory/_shared/utils/text.util';
import { DEMAND_BEARING_STATUSES } from '@plugins/inventory/material/constants/material.constant';
import {
  holdingOf,
  loadHoldings,
  shortageOf,
} from '@plugins/inventory/material/utils/order-holdings.util';
import {
  PURCHASE_REQUEST_CODE_INDEX,
  PURCHASE_REQUEST_CODE_PREFIX,
  PURCHASE_REQUEST_LABEL,
  PURCHASE_REQUEST_ORDER_LOCK,
  PURCHASE_REQUEST_TABLE,
} from '@plugins/inventory/purchase-request/constants/purchase-request.constant';
import {
  CreatePurchaseRequestDto,
  PurchaseRequestFilterDto,
  PurchaseRequestLineDto,
  PurchaseRequestReasonDto,
  UpdatePurchaseRequestDto,
} from '@plugins/inventory/purchase-request/dto/purchase-request.dto';
import {
  loadRequestLines,
  pendingSupplyOf,
  requestStatusOf,
  type RequestLineState,
} from '@plugins/inventory/purchase-request/utils/purchase-request-quantity.util';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import {
  createWithDocumentCode,
  yearlyDocumentCode,
} from '@plugins/sales/_shared/utils/sales-document-code.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

type RawRow = Record<string, unknown>;

export interface PurchaseRequestLineView {
  id: number;
  lineNo: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  quantity: number;
  neededBy: string | null;
  note: string | null;
  sourceOrderId: number | null;
  sourceOrderCode: string | null;
  ordered: number;
  remaining: number;
}

export interface PurchaseRequestView {
  id: number;
  code: string;
  status: 'cancelled' | 'ordered' | 'open';
  note: string | null;
  cancelReason: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
  lines: PurchaseRequestLineView[];
}

interface NewLine {
  itemId: number;
  quantity: string;
  neededBy: string | null;
  note: string | null;
  sourceOrderId: number | null;
}

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

/**
 * Purchase requests: raised by hand or from an order's shortage, edited and cancelled while
 * nothing has been ordered on them. What a line has been ordered is never stored; it is derived
 * from the purchase order lines made from it (D-11). Turning lines into a purchase order is
 * `PurchaseOrderFromRequestsService`.
 */
@Injectable()
export class PurchaseRequestService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrderMaterialReadPort,
    private readonly dataScope: DataScopeService,
  ) {}

  async findAll(query: PurchaseRequestFilterDto, actor: AuthUserPayload) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const conditions = ['TRUE'];
    const params: unknown[] = [];
    if (query.sourceOrderId) {
      params.push(query.sourceOrderId);
      conditions.push(
        `EXISTS (SELECT 1 FROM purchase_request_lines l
                  WHERE l.request_id = r.id AND l.source_order_id = $${params.length})`,
      );
    }
    const search = query.search?.trim();
    if (search) {
      params.push(`%${escapeLikePattern(search)}%`);
      conditions.push(
        `erp_unaccent(r.code) ILIKE erp_unaccent($${params.length})`,
      );
    }
    params.push(take, skip);
    const rows: RawRow[] = await this.dataSource.query(
      `SELECT r.*, u.full_name AS created_by_name, COUNT(*) OVER () AS total_rows
         FROM purchase_requests r
         LEFT JOIN users u ON u.id = r.created_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY r.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = rows.length > 0 ? Number(rows[0].total_rows) : 0;
    const views = await this.toViews(this.dataSource.manager, rows, actor);
    return paginate(views, total, page, limit);
  }

  async findOne(
    id: number,
    actor: AuthUserPayload,
  ): Promise<PurchaseRequestView> {
    const rows: RawRow[] = await this.dataSource.query(
      `SELECT r.*, u.full_name AS created_by_name
         FROM purchase_requests r
         LEFT JOIN users u ON u.id = r.created_by
        WHERE r.id = $1`,
      [id],
    );
    if (rows.length === 0) {
      throw new NotFoundException(`${PURCHASE_REQUEST_LABEL} not found`);
    }
    const [view] = await this.toViews(this.dataSource.manager, rows, actor);
    return view;
  }

  /** A request raised by hand, numbered `PR_YYYY_NNNN`; its items must be active. */
  async create(dto: CreatePurchaseRequestDto, actor: AuthUserPayload) {
    const id = await this.insert(
      dto.note,
      dto.lines.map((line) => this.newLine(line, null)),
      actor,
    );
    return this.findOne(id, actor);
  }

  /**
   * Requests what one order still lacks, per item: its shortage less what open requests for it
   * still ask and what purchase orders bought for it still bring. The per-order advisory lock is
   * taken before anything is read, so a second request for the same order waits and then sees
   * the first one's lines (409 when nothing is left to request).
   */
  async createFromOrder(orderId: number, actor: AuthUserPayload) {
    const order = await this.orders.getOrder(this.dataSource.manager, orderId);
    if (!order || !this.dataScope.canSeeMaterial(actor, order)) {
      throw new NotFoundException('Order not found');
    }
    const id = await createWithDocumentCode(
      this.dataSource,
      {
        table: PURCHASE_REQUEST_TABLE,
        prefix: PURCHASE_REQUEST_CODE_PREFIX,
        codeUniqueIndex: PURCHASE_REQUEST_CODE_INDEX,
        exhaustedMessage:
          'Could not allocate a purchase request number; please try again.',
        // The order's lock comes first (D-04 order position), before the number is read.
        format: async (context) => {
          await context.manager.query(`SELECT pg_advisory_xact_lock($1, $2)`, [
            PURCHASE_REQUEST_ORDER_LOCK,
            orderId,
          ]);
          return yearlyDocumentCode(context);
        },
      },
      async (manager, code) => {
        const lines = await this.prefill(manager, orderId);
        if (lines.length === 0) {
          throw new ConflictException(
            `Order ${order.code} lacks nothing that is not already requested or on its way.`,
          );
        }
        return this.insertWith(manager, code, null, lines, actor);
      },
    );
    return this.findOne(id, actor);
  }

  /** Edits a request nothing has been ordered on; lines, when given, replace every line. */
  async update(
    id: number,
    dto: UpdatePurchaseRequestDto,
    actor: AuthUserPayload,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const request = await this.lock(manager, id);
      const lines = await loadRequestLines(manager, [id]);
      this.assertUntouched(request, lines, 'edited');
      if (dto.lines) {
        // Edited lines keep the order each replaced line was raised for, matched by item.
        const sourceOf = new Map(
          lines.map((line) => [line.itemId, line.sourceOrderId]),
        );
        await manager.query(
          `DELETE FROM purchase_request_lines WHERE request_id = $1`,
          [id],
        );
        await this.insertLines(
          manager,
          id,
          dto.lines.map((line) =>
            this.newLine(line, sourceOf.get(line.itemId) ?? null),
          ),
        );
      }
      await manager.query(
        `UPDATE purchase_requests SET note = $2, updated_by = $3, updated_at = NOW()
          WHERE id = $1`,
        [
          id,
          dto.note !== undefined ? trimToNull(dto.note) : request.note,
          actor.userId,
        ],
      );
    });
    return this.findOne(id, actor);
  }

  /** Cancels a request nothing has been ordered on. */
  async cancel(
    id: number,
    dto: PurchaseRequestReasonDto,
    actor: AuthUserPayload,
  ) {
    const reason = requireText(dto.reason, 'Reason is required.');
    await this.dataSource.transaction(async (manager) => {
      const request = await this.lock(manager, id);
      const lines = await loadRequestLines(manager, [id]);
      this.assertUntouched(request, lines, 'cancelled');
      await manager.query(
        `UPDATE purchase_requests
            SET is_cancelled = true, cancel_reason = $2, cancelled_by = $3,
                cancelled_at = NOW(), updated_by = $3, updated_at = NOW()
          WHERE id = $1`,
        [id, reason, actor.userId],
      );
    });
    return this.findOne(id, actor);
  }

  /** The request header `FOR UPDATE`: cancel, edit and convert all take it first (D-04). */
  private async lock(
    manager: EntityManager,
    id: number,
  ): Promise<{
    id: number;
    code: string;
    isCancelled: boolean;
    note: string | null;
  }> {
    const [row]: Array<{
      id: number;
      code: string;
      is_cancelled: boolean;
      note: string | null;
    }> = await manager.query(
      `SELECT id, code, is_cancelled, note FROM purchase_requests WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!row) {
      throw new NotFoundException(`${PURCHASE_REQUEST_LABEL} not found`);
    }
    return {
      id: Number(row.id),
      code: row.code,
      isCancelled: row.is_cancelled,
      note: row.note,
    };
  }

  private assertUntouched(
    request: { code: string; isCancelled: boolean },
    lines: readonly RequestLineState[],
    action: string,
  ): void {
    if (request.isCancelled) {
      throw new ConflictException(
        `${PURCHASE_REQUEST_LABEL} ${request.code} is cancelled and cannot be ${action}.`,
      );
    }
    if (lines.some((line) => line.ordered.greaterThan(0))) {
      throw new ConflictException(
        `${PURCHASE_REQUEST_LABEL} ${request.code} has been ordered and cannot be ${action}.`,
      );
    }
  }

  /** One line per item the order is still short of, beyond what is requested or on its way. */
  private async prefill(
    manager: EntityManager,
    orderId: number,
  ): Promise<NewLine[]> {
    const demands = await this.orders.openDemand(
      manager,
      { orderId },
      DEMAND_BEARING_STATUSES,
    );
    const holdings = await loadHoldings(
      manager,
      demands.map((demand) => demand.itemId),
    );
    const pending = await pendingSupplyOf(manager, orderId);
    return demands
      .map((demand) => ({
        itemId: demand.itemId,
        quantity: shortageOf(
          demand.demand,
          holdingOf(holdings, orderId, demand.itemId),
        ).sub(pending.get(demand.itemId) ?? 0),
      }))
      .filter((line) => line.quantity.greaterThan(0))
      .sort((a, b) => a.itemId - b.itemId)
      .map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity.toFixed(),
        neededBy: null,
        note: null,
        sourceOrderId: orderId,
      }));
  }

  private newLine(
    line: PurchaseRequestLineDto,
    sourceOrderId: number | null,
  ): NewLine {
    return {
      itemId: line.itemId,
      quantity: new Decimal(String(line.quantity)).toFixed(),
      neededBy: line.neededBy ?? null,
      note: trimToNull(line.note),
      sourceOrderId,
    };
  }

  private insert(
    note: string | null | undefined,
    lines: NewLine[],
    actor: AuthUserPayload,
  ): Promise<number> {
    return createWithDocumentCode(
      this.dataSource,
      {
        table: PURCHASE_REQUEST_TABLE,
        prefix: PURCHASE_REQUEST_CODE_PREFIX,
        codeUniqueIndex: PURCHASE_REQUEST_CODE_INDEX,
        exhaustedMessage:
          'Could not allocate a purchase request number; please try again.',
      },
      (manager, code) => this.insertWith(manager, code, note, lines, actor),
    );
  }

  private async insertWith(
    manager: EntityManager,
    code: string,
    note: string | null | undefined,
    lines: NewLine[],
    actor: AuthUserPayload,
  ): Promise<number> {
    const [row]: Array<{ id: number }> = await manager.query(
      `INSERT INTO purchase_requests (code, note, created_by, updated_by)
       VALUES ($1, $2, $3, $3) RETURNING id`,
      [code, trimToNull(note), actor.userId],
    );
    await this.insertLines(manager, Number(row.id), lines);
    return Number(row.id);
  }

  /** The items `FOR SHARE` in ascending id, so none can be deleted under the request. */
  private async insertLines(
    manager: EntityManager,
    requestId: number,
    lines: readonly NewLine[],
  ): Promise<void> {
    const ids = [...new Set(lines.map((line) => line.itemId))].sort(
      (a, b) => a - b,
    );
    const items: Array<{ id: number; code: string; is_deleted: boolean }> =
      await manager.query(
        `SELECT id, code, is_deleted FROM items WHERE id = ANY($1::int[])
          ORDER BY id FOR SHARE`,
        [ids],
      );
    const found = new Map(items.map((item) => [Number(item.id), item]));
    for (const id of ids) {
      const item = found.get(id);
      if (!item) throw new NotFoundException(`Item ${id} not found.`);
      if (item.is_deleted) {
        throw new ConflictException(`Item ${item.code} is deleted.`);
      }
    }
    for (const [index, line] of lines.entries()) {
      await manager.query(
        `INSERT INTO purchase_request_lines
           (request_id, line_no, item_id, quantity, needed_by, note, source_order_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          requestId,
          index + 1,
          line.itemId,
          line.quantity,
          line.neededBy,
          line.note,
          line.sourceOrderId,
        ],
      );
    }
  }

  /**
   * The requests with their lines. A line's sales order is named only to a reader whose
   * material scope reaches that order (D-09); to anyone else it reads as a line for no order.
   */
  private async toViews(
    manager: EntityManager,
    rows: RawRow[],
    actor: AuthUserPayload,
  ): Promise<PurchaseRequestView[]> {
    const lines = await loadRequestLines(
      manager,
      rows.map((row) => Number(row.id)),
    );
    const orderIds = [
      ...new Set(
        lines.flatMap((line) =>
          line.sourceOrderId === null ? [] : [line.sourceOrderId],
        ),
      ),
    ];
    const visible = new Map(
      [...(await this.orders.getOrders(manager, orderIds))].filter(
        ([, order]) => this.dataScope.canSeeMaterial(actor, order),
      ),
    );
    return rows.map((row) => {
      const own = lines.filter((line) => line.requestId === Number(row.id));
      return {
        id: Number(row.id),
        code: String(row.code),
        status: requestStatusOf(Boolean(row.is_cancelled), own),
        note: textOrNull(row.note),
        cancelReason: textOrNull(row.cancel_reason),
        createdBy: row.created_by === null ? null : Number(row.created_by),
        createdByName: textOrNull(row.created_by_name),
        createdAt: row.created_at as Date,
        lines: own.map((line) => ({
          id: line.id,
          lineNo: line.lineNo,
          itemId: line.itemId,
          itemCode: line.itemCode,
          itemName: line.itemName,
          itemUnit: line.itemUnit,
          quantity: line.quantity.toNumber(),
          neededBy: line.neededBy,
          note: line.note,
          sourceOrderId:
            line.sourceOrderId !== null && visible.has(line.sourceOrderId)
              ? line.sourceOrderId
              : null,
          sourceOrderCode:
            line.sourceOrderId === null
              ? null
              : (visible.get(line.sourceOrderId)?.code ?? null),
          ordered: line.ordered.toNumber(),
          remaining: line.remaining.toNumber(),
        })),
      };
    });
  }
}
