import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

import { requireText } from '@plugins/inventory/_shared/utils/text.util';
import { ReservationService } from '@plugins/inventory/material/services/reservation.service';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import {
  StockPostingService,
  type StockPostingLine,
} from '@plugins/inventory/stock/services/stock-posting.service';
import { STOCKTAKE_DOCUMENT_TYPE } from '@plugins/inventory/stocktake/constants/stocktake.constant';
import { StocktakeReasonDto } from '@plugins/inventory/stocktake/dto/stocktake.dto';
import {
  STOCKTAKE_OPEN,
  StocktakeStatus,
} from '@plugins/inventory/stocktake/enums/stocktake.enum';
import { StocktakeService } from '@plugins/inventory/stocktake/services/stocktake.service';
import {
  assertStocktakeStatus,
  lockStocktake,
  moveStocktake,
  type LockedStocktake,
} from '@plugins/inventory/stocktake/utils/stocktake-lock.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/** Cost of one unit: 4 dp half-up, like every average (D-06). */
const COST_DECIMALS = 4;

interface CountedLine {
  id: number;
  item_id: number;
  item_code: string;
  counted_qty: string;
  book_qty: string;
}

/**
 * A count's decisions. Each runs in one transaction that takes the header `FOR UPDATE` and
 * moves it with `UPDATE … WHERE status = :expected`, so two decisions on one count never both
 * act on the status they read (an approve racing a cancel: one wins, the other gets 409).
 * Approval posts, for every counted line, the difference against the book quantity at counting
 * time on top of today's stock (D-14): movements after the count stay counted once.
 */
@Injectable()
export class StocktakeApprovalService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly stocktakes: StocktakeService,
    private readonly posting: StockPostingService,
    private readonly reservations: ReservationService,
    private readonly shortageAlerts: ShortageAlertService,
  ) {}

  async submit(id: number, actor: AuthUserPayload) {
    await this.dataSource.transaction(async (manager) => {
      const held = await lockStocktake(manager, id);
      assertStocktakeStatus(held, [StocktakeStatus.COUNTING], 'submitted');
      await moveStocktake(
        manager,
        held,
        StocktakeStatus.SUBMITTED,
        [
          'submitted_by = $3',
          'submitted_at = NOW()',
          `submitter_ids = CASE WHEN $3::int = ANY(submitter_ids) THEN submitter_ids
                                ELSE array_append(submitter_ids, $3::int) END`,
        ],
        [actor.userId],
      );
    });
    return this.stocktakes.findOne(id, actor);
  }

  /** Sends the count back to counting; its lines stay and can be recounted. */
  async reject(id: number, dto: StocktakeReasonDto, actor: AuthUserPayload) {
    const reason = requireText(dto.reason, 'Reason is required.');
    await this.dataSource.transaction(async (manager) => {
      const held = await lockStocktake(manager, id);
      await this.assertUninvolved(manager, held, actor);
      assertStocktakeStatus(held, [StocktakeStatus.SUBMITTED], 'rejected');
      await moveStocktake(
        manager,
        held,
        StocktakeStatus.COUNTING,
        ['reject_reason = $3'],
        [reason],
      );
    });
    return this.stocktakes.findOne(id, actor);
  }

  async cancel(id: number, dto: StocktakeReasonDto, actor: AuthUserPayload) {
    const reason = requireText(dto.reason, 'Reason is required.');
    await this.dataSource.transaction(async (manager) => {
      const held = await lockStocktake(manager, id);
      assertStocktakeStatus(held, STOCKTAKE_OPEN, 'cancelled');
      await moveStocktake(
        manager,
        held,
        StocktakeStatus.CANCELLED,
        ['cancel_reason = $3', 'cancelled_by = $4', 'cancelled_at = NOW()'],
        [reason, actor.userId],
      );
    });
    return this.stocktakes.findOne(id, actor);
  }

  /**
   * Posts the counted differences. A result below zero for any item refuses the whole count
   * (409, naming the items) and posts nothing; an uncounted line never posts.
   */
  async approve(id: number, actor: AuthUserPayload) {
    const posted = await this.dataSource.transaction(async (manager) => {
      const held = await lockStocktake(manager, id);
      await this.assertUninvolved(manager, held, actor);
      assertStocktakeStatus(held, [StocktakeStatus.SUBMITTED], 'approved');
      const change = await this.postDifferences(manager, held, actor);
      await moveStocktake(
        manager,
        held,
        StocktakeStatus.APPROVED,
        ['approved_by = $3', 'approved_at = NOW()'],
        [actor.userId],
      );
      return change;
    });
    await this.shortageAlerts.afterCommit(posted.orderIds, posted.itemIds);
    return this.stocktakes.findOne(id, actor);
  }

  private async postDifferences(
    manager: EntityManager,
    stocktake: LockedStocktake,
    actor: AuthUserPayload,
  ): Promise<{ orderIds: number[]; itemIds: number[] }> {
    const lines: CountedLine[] = await manager.query(
      `SELECT sl.id, sl.item_id, i.code AS item_code,
              sl.counted_qty::text AS counted_qty, sl.book_qty::text AS book_qty
         FROM stocktake_lines sl
         JOIN items i ON i.id = sl.item_id
        WHERE sl.stocktake_id = $1 AND sl.counted_qty IS NOT NULL
          AND sl.counted_qty <> sl.book_qty
        ORDER BY sl.item_id`,
      [stocktake.id],
    );
    if (lines.length === 0) return { orderIds: [], itemIds: [] };

    const diffOf = (line: CountedLine) =>
      new Decimal(line.counted_qty).sub(line.book_qty);
    const itemIds = lines.map((line) => Number(line.item_id));
    const stock = await this.posting.lockBalances(manager, itemIds);

    // Under the balance locks: today's stock plus what the count found missing or extra.
    const negative = lines.filter((line) => {
      const balance = stock.get(Number(line.item_id));
      return !balance || balance.onHand.add(diffOf(line)).isNegative();
    });
    if (negative.length > 0) {
      throw new ConflictException(
        `The count would leave less than nothing of ${negative
          .map((line) => line.item_code)
          .join(', ')}; recount before approving.`,
      );
    }

    const changedOrders = new Set<number>();
    const postingLines: StockPostingLine[] = [];
    const gained: number[] = [];
    for (const line of lines) {
      const itemId = Number(line.item_id);
      const diff = diffOf(line);
      const balance = stock.get(itemId) as {
        onHand: Decimal;
        reserved: Decimal;
      };
      if (diff.isNegative()) {
        const left = balance.onHand.add(diff);
        if (left.lessThan(balance.reserved)) {
          const shrunk = await this.reservations.deallocate(
            manager,
            itemId,
            left,
          );
          for (const orderId of shrunk.orderIds) changedOrders.add(orderId);
        }
        postingLines.push({
          itemId,
          movementType: StockMovementType.COUNT_ADJUSTMENT,
          quantity: diff.toFixed(),
          documentLineId: Number(line.id),
        });
      } else {
        gained.push(itemId);
        postingLines.push({
          itemId,
          movementType: StockMovementType.COUNT_ADJUSTMENT,
          quantity: diff.toFixed(),
          unitCost: (
            await this.gainCost(manager, itemId, balance.onHand)
          ).toFixed(),
          documentLineId: Number(line.id),
        });
      }
    }

    const result = await this.posting.post(manager, {
      documentType: STOCKTAKE_DOCUMENT_TYPE,
      documentId: stocktake.id,
      lines: postingLines,
      actorId: actor.userId,
    });
    if (gained.length > 0) {
      const allocated = await this.reservations.allocate(manager, gained);
      for (const orderId of allocated.orderIds) changedOrders.add(orderId);
    }
    await manager.query(
      `UPDATE stocktake_lines sl SET unit_cost = m.unit_cost, value = m.value
         FROM stock_movements m
        WHERE sl.stocktake_id = $1 AND m.document_type = $2 AND m.document_id = $1
          AND m.document_line_id = sl.id`,
      [stocktake.id, STOCKTAKE_DOCUMENT_TYPE],
    );
    return {
      orderIds: [...changedOrders].sort((a, b) => a - b),
      itemIds: result.itemIds,
    };
  }

  /**
   * What found stock is worth (D-06): the current average; on an empty item the average the
   * last movement left; never moved, the item's reference price; else 0 (opening balance).
   */
  private async gainCost(
    manager: EntityManager,
    itemId: number,
    onHand: Decimal,
  ): Promise<Decimal> {
    if (onHand.greaterThan(0)) {
      const [balance]: Array<{ value: string }> = await manager.query(
        `SELECT value::text AS value FROM stock_balances WHERE item_id = $1`,
        [itemId],
      );
      return new Decimal(balance.value)
        .dividedBy(onHand)
        .toDecimalPlaces(COST_DECIMALS, Decimal.ROUND_HALF_UP);
    }
    const [last]: Array<{ avg: string }> = await manager.query(
      `SELECT avg_cost_after::text AS avg FROM stock_movements
        WHERE item_id = $1 ORDER BY id DESC LIMIT 1`,
      [itemId],
    );
    if (last) return new Decimal(last.avg);
    const [item]: Array<{ reference_price: string | null }> =
      await manager.query(
        `SELECT reference_price::text AS reference_price FROM items WHERE id = $1`,
        [itemId],
      );
    return new Decimal(item?.reference_price ?? 0);
  }

  /**
   * Four eyes: whoever created the count, ever submitted it, or saved any count on it cannot
   * decide on it — every user in the count log, not only the last counter of each line.
   */
  private async assertUninvolved(
    manager: EntityManager,
    stocktake: LockedStocktake,
    actor: AuthUserPayload,
  ): Promise<void> {
    const counters: Array<{ user_id: number }> = await manager.query(
      `SELECT DISTINCT c.user_id FROM stocktake_count_log c
         JOIN stocktake_lines sl ON sl.id = c.line_id
        WHERE sl.stocktake_id = $1`,
      [stocktake.id],
    );
    const involved = new Set<number>([
      ...counters.map((row) => Number(row.user_id)),
      ...stocktake.submitterIds,
      ...(stocktake.createdBy === null ? [] : [stocktake.createdBy]),
    ]);
    if (involved.has(actor.userId)) {
      throw new ForbiddenException(
        'The creator, a submitter or a counter of a stock count cannot approve or reject it.',
      );
    }
  }
}
