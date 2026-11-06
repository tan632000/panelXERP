import { Decimal } from "decimal.js";

/**
 * The estimate's figures as the screen shows them while a row is being typed. DISPLAY ONLY:
 * the server computes and stores every total, and what it returns replaces these as soon as
 * an edit is saved. The rule is the server's, on the same decimal arithmetic:
 *
 *   line amount     = round half-up (quantity × unit cost) to whole VND
 *   panel unit cost = Σ line amounts + Σ cost lines          (one panel)
 *   panel total     = panel unit cost × panel quantity
 *   estimate total  = Σ panel totals
 */

type Numeric = number | string;

export interface BomLineFigures {
  quantity: Numeric;
  unitCost: Numeric;
}

export interface PanelFigures {
  quantity: Numeric;
  bomLines: readonly BomLineFigures[];
  /** Absent for an actor who cannot read prices; counts as none. */
  costLines?: ReadonlyArray<{ amount: Numeric }>;
}

export interface PanelTotals {
  lineAmounts: number[];
  unitCost: number;
  total: number;
}

const roundVnd = (value: Decimal) =>
  value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

/** A figure typed into a field: a blank or unparseable one counts as 0. */
export function toDecimal(value: Numeric | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") {
    return new Decimal(0);
  }
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

export function bomLineAmount(quantity: Numeric, unitCost: Numeric): number {
  return roundVnd(toDecimal(quantity).mul(toDecimal(unitCost))).toNumber();
}

export function computePanelTotals(panel: PanelFigures): PanelTotals {
  const lineAmounts = panel.bomLines.map((line) =>
    bomLineAmount(line.quantity, line.unitCost),
  );
  const unitCost = [
    ...lineAmounts,
    ...(panel.costLines ?? []).map((line) =>
      roundVnd(toDecimal(line.amount)).toNumber(),
    ),
  ].reduce((sum, amount) => sum.plus(amount), new Decimal(0));

  return {
    lineAmounts,
    unitCost: unitCost.toNumber(),
    total: unitCost.mul(toDecimal(panel.quantity)).toNumber(),
  };
}

export function computeRevisionTotal(panels: readonly PanelFigures[]): number {
  return panels
    .map((panel) => computePanelTotals(panel).total)
    .reduce((sum, total) => sum.plus(total), new Decimal(0))
    .toNumber();
}
