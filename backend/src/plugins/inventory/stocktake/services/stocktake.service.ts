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
import {
  STOCKTAKE_CODE_INDEX,
  STOCKTAKE_CODE_PREFIX,
  STOCKTAKE_LABEL,
  STOCKTAKE_OPEN_INDEX,
  STOCKTAKE_TABLE,
} from '@plugins/inventory/stocktake/constants/stocktake.constant';
import {
  CreateStocktakeDto,
  StocktakeFilterDto,
} from '@plugins/inventory/stocktake/dto/stocktake.dto';
import {
  StocktakeScope,
  StocktakeStatus,
} from '@plugins/inventory/stocktake/enums/stocktake.enum';
import {
  assertStocktakeStatus,
  lockStocktake,
} from '@plugins/inventory/stocktake/utils/stocktake-lock.util';
import { createWithDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/** Hidden from an actor without `purchase_price:read`; book quantity and difference are not. */
const LINE_MONEY_KEYS = ['unitCost', 'value'] as const;

export interface StocktakeRow {
  id: number;
  code: string;
  scope: StocktakeScope;
  locationId: number | null;
  locationCode: string | null;
  status: StocktakeStatus;
  note: string | null;
  lineCount: number;
  countedCount: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
}

export interface StocktakeLineView {
  id: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  /** Null until the item has been counted: an uncounted line never posts. */
  countedQty: number | null;
  /** On hand when the line was last counted. */
  bookQty: number | null;
  /** `countedQty − bookQty`, what approval would post. */
  diff: number | null;
  countedAt: Date | null;
  unitCost: number | null;
  value: number | null;
}

type RawRow = Record<string, unknown>;

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const dateOrNull = (value: unknown): Date | null =>
  value instanceof Date ? value : null;

const HEADER_COLUMNS = `t.*, l.code AS location_code, u.full_name AS created_by_name,
         (SELECT COUNT(*) FROM stocktake_lines sl WHERE sl.stocktake_id = t.id) AS line_count,
         (SELECT COUNT(*) FROM stocktake_lines sl
           WHERE sl.stocktake_id = t.id AND sl.counted_qty IS NOT NULL) AS counted_count`;
const HEADER_FROM = `FROM stocktakes t
    LEFT JOIN locations l ON l.id = t.location_id
    LEFT JOIN users u ON u.id = t.created_by`;

/**
 * Stock counts while they are open: list, read, create, and the counting itself. Stock keeps
 * moving during a count (D-14): each save of a counted quantity records the book quantity at
 * that moment, read under a share lock of the item's balance, and appends to the count log.
 * The decisions (submit, reject, cancel, approve) are `StocktakeApprovalService`.
 */
@Injectable()
export class StocktakeService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(query: StocktakeFilterDto) {
    const { page, limit, skip, take } = resolvePagination(
      query,
      DEFAULT_LIST_PAGE_SIZE,
    );
    const conditions = ['TRUE'];
    const params: unknown[] = [];
    if (query.status) {
      params.push(query.status);
      conditions.push(`t.status = $${params.length}`);
    }
    const search = query.search?.trim();
    if (search) {
      params.push(`%${escapeLikePattern(search)}%`);
      conditions.push(
        `erp_unaccent(t.code) ILIKE erp_unaccent($${params.length})`,
      );
    }
    params.push(take, skip);
    const rows: RawRow[] = await this.dataSource.query(
      `SELECT ${HEADER_COLUMNS}, COUNT(*) OVER () AS total_rows
       ${HEADER_FROM}
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.id DESC
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

  /** The count with its lines, and everyone who took part in it (none of them may approve). */
  async findOne(id: number, actor: AuthUserPayload) {
    const [head]: RawRow[] = await this.dataSource.query(
      `SELECT ${HEADER_COLUMNS} ${HEADER_FROM} WHERE t.id = $1`,
      [id],
    );
    if (!head) throw new NotFoundException(`${STOCKTAKE_LABEL} not found`);
    const lines: RawRow[] = await this.dataSource.query(
      `SELECT sl.*, sl.counted_qty::text AS counted_text, sl.book_qty::text AS book_text,
              i.code AS item_code, i.name AS item_name, i.unit AS item_unit
         FROM stocktake_lines sl
         JOIN items i ON i.id = sl.item_id
        WHERE sl.stocktake_id = $1
        ORDER BY i.code, sl.id`,
      [id],
    );
    const counters: Array<{ user_id: number }> = await this.dataSource.query(
      `SELECT DISTINCT c.user_id FROM stocktake_count_log c
         JOIN stocktake_lines sl ON sl.id = c.line_id
        WHERE sl.stocktake_id = $1`,
      [id],
    );
    const involved = new Set<number>([
      ...counters.map((row) => Number(row.user_id)),
      ...((head.submitter_ids as number[] | null) ?? []).map(Number),
      ...(head.created_by === null ? [] : [Number(head.created_by)]),
    ]);
    return {
      ...this.toRow(head),
      rejectReason: textOrNull(head.reject_reason),
      cancelReason: textOrNull(head.cancel_reason),
      submittedBy: numberOrNull(head.submitted_by),
      approvedBy: numberOrNull(head.approved_by),
      involvedUserIds: [...involved].sort((a, b) => a - b),
      lines: lines.map((line) =>
        withoutCosts(this.toLine(line), LINE_MONEY_KEYS, actor),
      ),
    };
  }

  /**
   * Opens a count numbered `KK_YYYY_NNNN`: the whole warehouse (every active item with stock
   * on hand) or one location (every active item kept there). Another open count → 409.
   */
  async create(dto: CreateStocktakeDto, actor: AuthUserPayload) {
    let id: number;
    try {
      id = await createWithDocumentCode(
        this.dataSource,
        {
          table: STOCKTAKE_TABLE,
          prefix: STOCKTAKE_CODE_PREFIX,
          codeUniqueIndex: STOCKTAKE_CODE_INDEX,
          exhaustedMessage:
            'Could not allocate a stock count number; please try again.',
        },
        async (manager, code) => {
          const locationId = await this.locationOf(manager, dto);
          const [row]: Array<{ id: number }> = await manager.query(
            `INSERT INTO stocktakes (code, scope, location_id, note, created_by)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [code, dto.scope, locationId, trimToNull(dto.note), actor.userId],
          );
          await manager.query(
            locationId === null
              ? `INSERT INTO stocktake_lines (stocktake_id, item_id)
                 SELECT $1, i.id FROM items i JOIN stock_balances b ON b.item_id = i.id
                  WHERE i.is_deleted = false AND b.on_hand <> 0
                  ORDER BY i.id`
              : `INSERT INTO stocktake_lines (stocktake_id, item_id)
                 SELECT $1, i.id FROM items i
                  WHERE i.is_deleted = false AND i.default_location_id = $2
                  ORDER BY i.id`,
            locationId === null ? [row.id] : [row.id, locationId],
          );
          return Number(row.id);
        },
      );
    } catch (error: unknown) {
      if (isUniqueViolationOn(error, [STOCKTAKE_OPEN_INDEX])) {
        throw new ConflictException(
          'Another stock count is still open: finish or cancel it first.',
        );
      }
      throw error;
    }
    return this.findOne(id, actor);
  }

  /** Adds one of the scanned item, giving it a line when the count has none (D-12). */
  async scan(id: number, code: string, actor: AuthUserPayload) {
    await this.dataSource.transaction(async (manager) => {
      const stocktake = await lockStocktake(manager, id);
      assertStocktakeStatus(stocktake, [StocktakeStatus.COUNTING], 'counted');
      const itemId = await this.resolveItem(manager, code);
      await manager.query(
        `INSERT INTO stocktake_lines (stocktake_id, item_id) VALUES ($1, $2)
         ON CONFLICT (stocktake_id, item_id) DO NOTHING`,
        [id, itemId],
      );
      const line = await this.lineOf(manager, id, itemId);
      await this.saveCount(
        manager,
        line.id,
        itemId,
        new Decimal(line.counted_qty ?? 0).add(1),
        actor,
      );
    });
    return this.findOne(id, actor);
  }

  /** Sets the counted quantity of an item already on the count. */
  async setCount(
    id: number,
    itemId: number,
    countedQty: number,
    actor: AuthUserPayload,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const stocktake = await lockStocktake(manager, id);
      assertStocktakeStatus(stocktake, [StocktakeStatus.COUNTING], 'counted');
      const line = await this.lineOf(manager, id, itemId);
      await this.saveCount(
        manager,
        line.id,
        itemId,
        new Decimal(String(countedQty)),
        actor,
      );
    });
    return this.findOne(id, actor);
  }

  /**
   * One save of a count: the book quantity is the item's on hand right now, read under a share
   * lock of its balance row so a posting holding that row is waited for, and the save is
   * logged. An item without a balance row yet reads 0: its first receipt then simply comes
   * after the count.
   */
  private async saveCount(
    manager: EntityManager,
    lineId: number,
    itemId: number,
    counted: Decimal,
    actor: AuthUserPayload,
  ): Promise<void> {
    const [balance]: Array<{ on_hand: string }> = await manager.query(
      `SELECT on_hand::text AS on_hand FROM stock_balances WHERE item_id = $1 FOR SHARE`,
      [itemId],
    );
    const book = balance ? balance.on_hand : '0';
    await manager.query(
      `UPDATE stocktake_lines SET counted_qty = $2, book_qty = $3, counted_at = NOW()
        WHERE id = $1`,
      [lineId, counted.toFixed(), book],
    );
    await manager.query(
      `INSERT INTO stocktake_count_log (line_id, user_id, counted_qty, book_qty)
       VALUES ($1, $2, $3, $4)`,
      [lineId, actor.userId, counted.toFixed(), book],
    );
  }

  private async lineOf(
    manager: EntityManager,
    stocktakeId: number,
    itemId: number,
  ): Promise<{ id: number; counted_qty: string | null }> {
    const [line]: Array<{ id: number; counted_qty: string | null }> =
      await manager.query(
        `SELECT id, counted_qty::text AS counted_qty FROM stocktake_lines
          WHERE stocktake_id = $1 AND item_id = $2`,
        [stocktakeId, itemId],
      );
    if (!line) {
      throw new NotFoundException(`Item ${itemId} is not on this stock count.`);
    }
    return { id: Number(line.id), counted_qty: line.counted_qty };
  }

  /** The active item a scanned value names: by barcode first, else by code, any case (D-12). */
  private async resolveItem(
    manager: EntityManager,
    code: string,
  ): Promise<number> {
    const value = code.trim();
    for (const column of ['barcode', 'code']) {
      const [row]: Array<{ id: number }> = await manager.query(
        `SELECT id FROM items WHERE is_deleted = false AND LOWER(${column}) = LOWER($1)`,
        [value],
      );
      if (row) return Number(row.id);
    }
    throw new NotFoundException(`No item for ${value}`);
  }

  private async locationOf(
    manager: EntityManager,
    dto: CreateStocktakeDto,
  ): Promise<number | null> {
    if (dto.scope === StocktakeScope.ALL) return null;
    if (!dto.locationId) {
      throw new BadRequestException('A location count needs its location.');
    }
    const [row]: Array<{ id: number }> = await manager.query(
      `SELECT id FROM locations WHERE id = $1 AND is_deleted = false`,
      [dto.locationId],
    );
    if (!row) {
      throw new NotFoundException(`Location ${dto.locationId} not found.`);
    }
    return Number(row.id);
  }

  private toRow(row: RawRow): StocktakeRow {
    return {
      id: Number(row.id),
      code: String(row.code),
      scope: row.scope as StocktakeScope,
      locationId: numberOrNull(row.location_id),
      locationCode: textOrNull(row.location_code),
      status: row.status as StocktakeStatus,
      note: textOrNull(row.note),
      lineCount: Number(row.line_count),
      countedCount: Number(row.counted_count),
      createdBy: numberOrNull(row.created_by),
      createdByName: textOrNull(row.created_by_name),
      createdAt: row.created_at as Date,
      submittedAt: dateOrNull(row.submitted_at),
      approvedAt: dateOrNull(row.approved_at),
    };
  }

  private toLine(row: RawRow): StocktakeLineView {
    const countedText = textOrNull(row.counted_text);
    const bookText = textOrNull(row.book_text);
    const counted = countedText === null ? null : new Decimal(countedText);
    const book = bookText === null ? null : new Decimal(bookText);
    return {
      id: Number(row.id),
      itemId: Number(row.item_id),
      itemCode: String(row.item_code),
      itemName: String(row.item_name),
      itemUnit: String(row.item_unit),
      countedQty: counted === null ? null : counted.toNumber(),
      bookQty: book === null ? null : book.toNumber(),
      diff:
        counted !== null && book !== null ? counted.sub(book).toNumber() : null,
      countedAt: dateOrNull(row.counted_at),
      unitCost: numberOrNull(row.unit_cost),
      value: numberOrNull(row.value),
    };
  }
}
