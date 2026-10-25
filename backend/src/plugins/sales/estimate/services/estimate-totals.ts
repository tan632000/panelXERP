import { Decimal } from 'decimal.js';

/**
 * The estimate's arithmetic as pure functions, on `decimal.js` so no figure goes through a
 * binary float (`Math.round(1.005 * 100)` is 100). Amounts are whole VND, rounded half-up:
 *
 *   line amount     = round(quantity × unit cost)
 *   panel unit cost = Σ line amounts + Σ cost-line amounts      (one panel)
 *   panel total     = panel unit cost × panel quantity
 *   revision total  = Σ panel totals
 */

type Numeric = number | string;

export interface BomLineFigures {
  quantity: Numeric;
  unitCost: Numeric;
}

export interface CostLineFigures {
  amount: Numeric;
}

export interface PanelFigures {
  quantity: Numeric;
  bomLines: readonly BomLineFigures[];
  costLines: readonly CostLineFigures[];
}

export interface PanelTotals {
  /** Amount of each BOM line, in the order given. */
  lineAmounts: number[];
  unitCost: number;
  total: number;
}

export interface RevisionTotals {
  panels: PanelTotals[];
  total: number;
}

const roundVnd = (value: Decimal): Decimal =>
  value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

/** `round_half_up(quantity × unitCost)` to whole VND. */
export function bomLineAmount(quantity: Numeric, unitCost: Numeric): number {
  return roundVnd(new Decimal(quantity).mul(unitCost)).toNumber();
}

/** A cost line's amount as it counts: whole VND, half-up. */
export function costLineAmount(amount: Numeric): number {
  return roundVnd(new Decimal(amount)).toNumber();
}

export function computePanelTotals(panel: PanelFigures): PanelTotals {
  const lineAmounts = panel.bomLines.map((line) =>
    bomLineAmount(line.quantity, line.unitCost),
  );
  const unitCost = [
    ...lineAmounts,
    ...panel.costLines.map((line) => costLineAmount(line.amount)),
  ].reduce((sum, amount) => sum.plus(amount), new Decimal(0));
  const total = unitCost.mul(panel.quantity);

  return {
    lineAmounts,
    unitCost: unitCost.toNumber(),
    total: total.toNumber(),
  };
}

export function computeRevisionTotals(
  panels: readonly PanelFigures[],
): RevisionTotals {
  const computed = panels.map(computePanelTotals);
  const total = computed.reduce(
    (sum, panel) => sum.plus(panel.total),
    new Decimal(0),
  );
  return { panels: computed, total: total.toNumber() };
}
