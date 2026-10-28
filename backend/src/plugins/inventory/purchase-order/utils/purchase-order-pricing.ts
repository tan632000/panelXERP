import { Decimal } from 'decimal.js';

export interface PricedLineInput {
  quantity: Decimal.Value;
  unitPrice: Decimal.Value;
}

/** Whole VND, as `numeric` text ready to store. */
export interface PurchaseOrderTotals {
  lineAmounts: string[];
  subtotal: string;
  vatAmount: string;
  total: string;
}

const wholeVnd = (value: Decimal) =>
  value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

/** `round(quantity × unit price)`, half-up to whole VND. */
export function lineAmount(line: PricedLineInput): Decimal {
  return wholeVnd(new Decimal(line.quantity).mul(line.unitPrice));
}

/**
 * The order's money: each line rounded on its own, the subtotal their sum, VAT rounded once on
 * the subtotal. All on decimals: `1.005 × 100` is 101 here, where float arithmetic gives 100.
 */
export function priceOrder(
  lines: readonly PricedLineInput[],
  vatRate: number,
): PurchaseOrderTotals {
  const amounts = lines.map(lineAmount);
  const subtotal = amounts.reduce(
    (sum, amount) => sum.add(amount),
    new Decimal(0),
  );
  const vatAmount = wholeVnd(subtotal.mul(vatRate).div(100));
  return {
    lineAmounts: amounts.map((amount) => amount.toFixed(0)),
    subtotal: subtotal.toFixed(0),
    vatAmount: vatAmount.toFixed(0),
    total: subtotal.add(vatAmount).toFixed(0),
  };
}
