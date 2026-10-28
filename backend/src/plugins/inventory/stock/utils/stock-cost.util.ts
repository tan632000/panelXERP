import { Decimal } from 'decimal.js';

/**
 * Weighted-average stock costing as pure functions, on `decimal.js` so no quantity or amount
 * goes through a binary float (`1.005 * 100` is 100.49999…, `0.1 + 0.2 - 0.3` is 5.55e-17):
 *
 *   average cost = value / on hand, 4 dp half-up (0 stock has no average)
 *   inbound      = +round(quantity × unit cost) to whole VND, half-up
 *   outbound     = −round(quantity × average cost), except that the movement emptying the
 *                  item takes the whole remaining value, so an empty item is worth exactly 0
 */

/** Quantities are stored with 3 decimals; anything finer would be rounded away by Postgres. */
export const QUANTITY_DECIMALS = 3;
const COST_DECIMALS = 4;

export interface StockState {
  onHand: Decimal;
  value: Decimal;
}

export interface CostedMovement {
  /** Signed: positive into stock, negative out of it. */
  quantity: Decimal;
  unitCost: Decimal;
  /** Signed whole VND, equal to the change of the stock value. */
  value: Decimal;
  onHandAfter: Decimal;
  valueAfter: Decimal;
  /** The average after the movement; an emptied item keeps the average it left at. */
  avgCostAfter: Decimal;
}

function wholeVnd(amount: Decimal): Decimal {
  return amount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/** `value / onHand` to 4 dp half-up, or 0 while nothing is on hand. */
export function averageCost(state: StockState): Decimal {
  if (state.onHand.isZero()) return new Decimal(0);
  return state.value
    .dividedBy(state.onHand)
    .toDecimalPlaces(COST_DECIMALS, Decimal.ROUND_HALF_UP);
}

/** What would be on hand after a signed quantity; negative means the posting must be refused. */
export function onHandAfter(state: StockState, quantity: Decimal): Decimal {
  return state.onHand.plus(quantity);
}

/** Goods coming in at a known unit cost (a purchase price, a return cost). */
export function inbound(
  state: StockState,
  quantity: Decimal,
  unitCost: Decimal,
): CostedMovement {
  const value = wholeVnd(quantity.times(unitCost));
  const after: StockState = {
    onHand: state.onHand.plus(quantity),
    value: state.value.plus(value),
  };
  return {
    quantity,
    unitCost,
    value,
    onHandAfter: after.onHand,
    valueAfter: after.value,
    avgCostAfter: averageCost(after),
  };
}

/**
 * Goods leaving at the current average. `quantity` is the positive amount taken and must not
 * exceed what is on hand; the caller refuses that before costing it.
 */
export function outbound(state: StockState, quantity: Decimal): CostedMovement {
  const unitCost = averageCost(state);
  const remaining = state.onHand.minus(quantity);
  // The average is rounded, so `quantity × average` can overshoot the value by a few VND on a
  // large stock; never take more than there is, or the value would go negative.
  const taken = remaining.isZero()
    ? state.value
    : Decimal.min(wholeVnd(quantity.times(unitCost)), state.value);
  const after: StockState = {
    onHand: remaining,
    value: state.value.minus(taken),
  };
  return {
    quantity: quantity.negated(),
    unitCost,
    value: taken.negated(),
    onHandAfter: after.onHand,
    valueAfter: after.value,
    avgCostAfter: remaining.isZero() ? unitCost : averageCost(after),
  };
}

/** True when the quantity carries more decimals than the ledger stores. */
export function exceedsQuantityPrecision(quantity: Decimal): boolean {
  return quantity.decimalPlaces() > QUANTITY_DECIMALS;
}
