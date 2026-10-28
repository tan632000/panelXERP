import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { EntityManager } from 'typeorm';

import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import {
  exceedsQuantityPrecision,
  inbound,
  onHandAfter,
  outbound,
  QUANTITY_DECIMALS,
  type CostedMovement,
  type StockState,
} from '@plugins/inventory/stock/utils/stock-cost.util';

/**
 * Movement kinds this service costs. A supplier return leaves at its purchase price rather than
 * at the average, and is added together with the document that posts it.
 */
export type PostableMovementType = Exclude<
  StockMovementType,
  StockMovementType.SUPPLIER_RETURN
>;

/** Kinds that only bring stock in, and kinds that only take it out. */
const INBOUND_ONLY = new Set<StockMovementType>([
  StockMovementType.RECEIPT,
  StockMovementType.WORKSHOP_RETURN,
]);
const OUTBOUND_ONLY = new Set<StockMovementType>([StockMovementType.ISSUE]);

export interface StockPostingLine {
  itemId: number;
  movementType: PostableMovementType;
  /** Signed: positive into stock, negative out of it. Up to 3 decimals. */
  quantity: Decimal.Value;
  /** Unit cost of stock coming in, VND; ignored for stock going out, which leaves at the average. */
  unitCost?: Decimal.Value | null;
  documentLineId?: number | null;
  orderId?: number | null;
  orderLineId?: number | null;
  reason?: string | null;
}

export interface StockPostingRequest {
  /** The posting document's kind, e.g. `stock_receipt`. */
  documentType: string;
  documentId: number;
  lines: readonly StockPostingLine[];
  actorId?: number | null;
}

export interface StockPostingResult {
  /** Every item the posting touched, ascending — the input of the after-commit alerts. */
  itemIds: number[];
  movementIds: string[];
}

interface LockedBalance {
  item_id: number;
  on_hand: string;
  reserved: string;
  value: string;
}

interface LockedItem {
  id: number;
  code: string;
  is_deleted: boolean;
}

interface ItemLedger {
  code: string;
  reserved: Decimal;
  state: StockState;
}

/**
 * The only writer of stock balances and movements. It runs inside the posting document's
 * transaction, so a refused line rolls back the whole document.
 *
 * Locks follow the global order: the balance rows `FOR UPDATE` in ascending item id (missing
 * rows created first), then the same item rows `FOR SHARE` ascending, so two postings over the
 * same items wait for each other instead of deadlocking, and an item deleted meanwhile is seen.
 */
@Injectable()
export class StockPostingService {
  async post(
    manager: EntityManager,
    request: StockPostingRequest,
  ): Promise<StockPostingResult> {
    if (request.lines.length === 0) {
      throw new BadRequestException('A stock posting needs at least one line.');
    }
    const quantities = request.lines.map((line) => this.quantityOf(line));

    const itemIds = [...new Set(request.lines.map((line) => line.itemId))].sort(
      (a, b) => a - b,
    );
    const ledgers = await this.lock(manager, itemIds);

    const costed = request.lines.map((line, index) =>
      this.cost(line, quantities[index], ledgerOf(ledgers, line.itemId)),
    );

    const movementIds: string[] = [];
    for (const [index, line] of request.lines.entries()) {
      movementIds.push(
        await this.insertMovement(manager, request, line, costed[index]),
      );
    }
    for (const itemId of itemIds) {
      const { state } = ledgerOf(ledgers, itemId);
      await manager.query(
        `UPDATE stock_balances SET on_hand = $2, value = $3, updated_at = NOW()
         WHERE item_id = $1`,
        [itemId, state.onHand.toFixed(), state.value.toFixed()],
      );
    }

    return { itemIds, movementIds };
  }

  private quantityOf(line: StockPostingLine): Decimal {
    let quantity: Decimal;
    try {
      quantity = new Decimal(line.quantity);
    } catch {
      throw new BadRequestException('Stock quantity must be a number.');
    }
    if (!quantity.isFinite() || quantity.isZero()) {
      throw new BadRequestException('Stock quantity must not be zero.');
    }
    if (exceedsQuantityPrecision(quantity)) {
      throw new BadRequestException(
        `Stock quantity allows at most ${QUANTITY_DECIMALS} decimals.`,
      );
    }
    if (INBOUND_ONLY.has(line.movementType) && quantity.isNegative()) {
      throw new BadRequestException(
        `A ${line.movementType} brings stock in; its quantity must be positive.`,
      );
    }
    if (OUTBOUND_ONLY.has(line.movementType) && quantity.isPositive()) {
      throw new BadRequestException(
        `An ${line.movementType} takes stock out; its quantity must be negative.`,
      );
    }
    return quantity;
  }

  private async lock(
    manager: EntityManager,
    itemIds: number[],
  ): Promise<Map<number, ItemLedger>> {
    // Only ids of existing items get a row; an unknown id is reported below. Ascending, so two
    // postings creating the same rows wait on each other in the same order.
    await manager.query(
      `INSERT INTO stock_balances (item_id)
       SELECT id FROM items WHERE id = ANY($1::int[]) ORDER BY id
       ON CONFLICT (item_id) DO NOTHING`,
      [itemIds],
    );
    const balances: LockedBalance[] = await manager.query(
      `SELECT item_id, on_hand, reserved, value FROM stock_balances
       WHERE item_id = ANY($1::int[]) ORDER BY item_id FOR UPDATE`,
      [itemIds],
    );
    const items: LockedItem[] = await manager.query(
      `SELECT id, code, is_deleted FROM items
       WHERE id = ANY($1::int[]) ORDER BY id FOR SHARE`,
      [itemIds],
    );

    const itemById = new Map(items.map((item) => [item.id, item]));
    const ledgers = new Map<number, ItemLedger>();
    for (const itemId of itemIds) {
      const item = itemById.get(itemId);
      if (!item) throw new NotFoundException(`Item ${itemId} not found.`);
      if (item.is_deleted) {
        throw new ConflictException(`Item ${item.code} has been deleted.`);
      }
      // Every existing item got a row above, and the row is locked now.
      const balance = balances.find((row) => row.item_id === itemId);
      if (!balance) throw new Error(`No stock balance row for item ${itemId}`);
      ledgers.set(itemId, {
        code: item.code,
        reserved: new Decimal(balance.reserved),
        state: {
          onHand: new Decimal(balance.on_hand),
          value: new Decimal(balance.value),
        },
      });
    }
    return ledgers;
  }

  /** Costs one line against the item's running state and advances that state. */
  private cost(
    line: StockPostingLine,
    quantity: Decimal,
    ledger: ItemLedger,
  ): CostedMovement {
    let movement: CostedMovement;
    if (quantity.isPositive()) {
      movement = inbound(ledger.state, quantity, this.unitCostOf(line));
    } else {
      const remaining = onHandAfter(ledger.state, quantity);
      if (remaining.isNegative()) {
        throw new ConflictException(
          `Item ${ledger.code} would leave ${remaining.toFixed()} on hand.`,
        );
      }
      movement = outbound(ledger.state, quantity.negated());
    }

    if (movement.onHandAfter.lessThan(ledger.reserved)) {
      throw new ConflictException(
        `Item ${ledger.code} would leave ${movement.onHandAfter.toFixed()} on hand, below the ${ledger.reserved.toFixed()} reserved.`,
      );
    }
    ledger.state = {
      onHand: movement.onHandAfter,
      value: movement.valueAfter,
    };
    return movement;
  }

  private unitCostOf(line: StockPostingLine): Decimal {
    if (line.unitCost === null || line.unitCost === undefined) {
      throw new BadRequestException('Stock coming in needs a unit cost.');
    }
    let unitCost: Decimal;
    try {
      unitCost = new Decimal(line.unitCost);
    } catch {
      throw new BadRequestException('Unit cost must be a number.');
    }
    if (!unitCost.isFinite() || unitCost.isNegative()) {
      throw new BadRequestException('Unit cost must not be negative.');
    }
    return unitCost;
  }

  private async insertMovement(
    manager: EntityManager,
    request: StockPostingRequest,
    line: StockPostingLine,
    movement: CostedMovement,
  ): Promise<string> {
    const [row]: Array<{ id: string }> = await manager.query(
      `INSERT INTO stock_movements (
         item_id, movement_type, quantity, unit_cost, value, on_hand_after, avg_cost_after,
         document_type, document_id, document_line_id, order_id, order_line_id, reason, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        line.itemId,
        line.movementType,
        movement.quantity.toFixed(),
        movement.unitCost.toFixed(4),
        movement.value.toFixed(),
        movement.onHandAfter.toFixed(),
        movement.avgCostAfter.toFixed(4),
        request.documentType,
        request.documentId,
        line.documentLineId ?? null,
        line.orderId ?? null,
        line.orderLineId ?? null,
        line.reason ?? null,
        request.actorId ?? null,
      ],
    );
    return String(row.id);
  }
}

function ledgerOf(
  ledgers: Map<number, ItemLedger>,
  itemId: number,
): ItemLedger {
  const ledger = ledgers.get(itemId);
  // `lock` builds one ledger per distinct item of the request, or throws.
  if (!ledger) throw new Error(`Item ${itemId} was not locked`);
  return ledger;
}
