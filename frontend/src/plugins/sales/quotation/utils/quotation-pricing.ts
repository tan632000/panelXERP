import { Decimal } from "decimal.js";

import type { DiscountType } from "@plugins/sales/quotation/constants";

/**
 * The quotation's figures as the screen shows them while margins, the discount and the VAT
 * rate are typed. DISPLAY ONLY: the server computes and stores every total, and what it
 * returns replaces these as soon as a change is saved. The rule is the server's, on the same
 * decimal arithmetic (no binary float: `Math.round(100 × 1.005)` is 100, the answer is 101):
 *
 *   unit price  = round half-up (unit cost × (1 + margin%))
 *   line amount = unit price × panel quantity
 *   subtotal    = Σ line amounts
 *   discount    = round half-up (subtotal × percent) or the fixed amount, rounded
 *   taxable     = subtotal − discount
 *   VAT         = round half-up (taxable × rate)
 *   total       = taxable + VAT
 */

type Numeric = number | string;

export interface PricingLineFigures {
  unitCost: Numeric;
  marginPercent: Numeric;
  quantity: Numeric;
}

export interface PricingFigures {
  lines: readonly PricingLineFigures[];
  discountType: DiscountType;
  discountValue: Numeric;
  vatRate: Numeric;
}

export interface QuotationFigures {
  lines: Array<{ unitPrice: number; amount: number }>;
  subtotal: number;
  discountAmount: number;
  taxable: number;
  vatAmount: number;
  total: number;
  /** The discount is above the subtotal: the server would refuse it. */
  discountTooLarge: boolean;
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

export function panelUnitPrice(
  unitCost: Numeric,
  marginPercent: Numeric,
): number {
  return roundVnd(
    toDecimal(unitCost).mul(toDecimal(marginPercent).div(100).plus(1)),
  ).toNumber();
}

export function computeQuotationFigures(
  input: PricingFigures,
): QuotationFigures {
  const lines = input.lines.map((line) => {
    const unitPrice = panelUnitPrice(line.unitCost, line.marginPercent);
    return {
      unitPrice,
      amount: new Decimal(unitPrice).mul(toDecimal(line.quantity)).toNumber(),
    };
  });
  const subtotal = lines.reduce(
    (sum, line) => sum.plus(line.amount),
    new Decimal(0),
  );
  const discount = roundVnd(
    input.discountType === "percent"
      ? subtotal.mul(toDecimal(input.discountValue)).div(100)
      : toDecimal(input.discountValue),
  );
  const discountTooLarge = discount.gt(subtotal);
  const taxable = discountTooLarge ? subtotal : subtotal.minus(discount);
  const vat = roundVnd(taxable.mul(toDecimal(input.vatRate)).div(100));

  return {
    lines,
    subtotal: subtotal.toNumber(),
    discountAmount: discountTooLarge ? 0 : discount.toNumber(),
    taxable: taxable.toNumber(),
    vatAmount: vat.toNumber(),
    total: taxable.plus(vat).toNumber(),
    discountTooLarge,
  };
}

const ROMAN_NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** Roman numeral of a panel's position on the quotation (1 → I), as the company layout numbers them. */
export function toRoman(position: number): string {
  let rest = Math.max(0, Math.floor(position));
  let result = "";
  for (const [value, symbol] of ROMAN_NUMERALS) {
    while (rest >= value) {
      result += symbol;
      rest -= value;
    }
  }
  return result;
}
