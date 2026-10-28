import { Decimal } from "decimal.js";

/**
 * The order's money as the editor shows it while lines are typed. DISPLAY ONLY: the server
 * computes and stores the figures, on the same rule — each line `round(qty × price)` half-up
 * to whole VND, the subtotal their sum, VAT `round(subtotal × rate / 100)` once.
 */
export interface PreviewLine {
  quantity: number | string | null;
  unitPrice: number | string | null;
}

const toDecimal = (value: number | string | null): Decimal => {
  if (value === null || value === "") return new Decimal(0);
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
};

const wholeVnd = (value: Decimal) =>
  value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

export function previewLineAmount(line: PreviewLine): number {
  return wholeVnd(
    toDecimal(line.quantity).mul(toDecimal(line.unitPrice)),
  ).toNumber();
}

export function previewOrderTotals(
  lines: readonly PreviewLine[],
  vatRate: number,
) {
  const subtotal = lines.reduce(
    (sum, line) => sum.add(previewLineAmount(line)),
    new Decimal(0),
  );
  const vatAmount = wholeVnd(subtotal.mul(vatRate).div(100));
  return {
    subtotal: subtotal.toNumber(),
    vatAmount: vatAmount.toNumber(),
    total: subtotal.add(vatAmount).toNumber(),
  };
}
