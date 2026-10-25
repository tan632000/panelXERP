import { BadRequestException } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { MAX_QUOTATION_AMOUNT } from '@plugins/sales/quotation/constants/quotation.constant';
import { DiscountType } from '@plugins/sales/quotation/enums/discount-type.enum';

/**
 * The quotation's arithmetic as pure functions, on `decimal.js` so no figure goes through a
 * binary float (`Math.round(100 × 1.005)` is 100, the exact answer is 101). Amounts are whole
 * VND, rounded half-up at the three places money is cut:
 *
 *   unit price  = round(unit cost × (1 + margin%))        per panel
 *   line amount = unit price × panel quantity
 *   subtotal    = Σ line amounts
 *   discount    = round(subtotal × percent) or the fixed amount, rounded
 *   taxable     = subtotal − discount                      (discount ≤ subtotal)
 *   VAT         = round(taxable × rate)                    one rate per version
 *   total       = taxable + VAT
 */

type Numeric = number | string;

export interface PricingLine {
  /** Cost of one panel, VND. */
  unitCost: Numeric;
  /** Margin over the cost, percent. */
  marginPercent: Numeric;
  quantity: Numeric;
}

export interface PricingInput {
  lines: readonly PricingLine[];
  discountType: DiscountType;
  /** Percent or VND, per `discountType`. */
  discountValue: Numeric;
  /** VAT rate, percent. */
  vatRate: Numeric;
}

export interface PricedLine {
  unitPrice: number;
  amount: number;
}

export interface QuotationPricing {
  lines: PricedLine[];
  subtotal: number;
  discountAmount: number;
  taxable: number;
  vatAmount: number;
  total: number;
}

const roundVnd = (value: Decimal): Decimal =>
  value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

/** `round_half_up(unitCost × (1 + margin / 100))` to whole VND. */
export function panelUnitPrice(
  unitCost: Numeric,
  marginPercent: Numeric,
): number {
  return roundVnd(
    new Decimal(unitCost).mul(new Decimal(marginPercent).div(100).plus(1)),
  ).toNumber();
}

export function computeQuotationPricing(input: PricingInput): QuotationPricing {
  const lines = input.lines.map((line) => {
    const unitPrice = panelUnitPrice(line.unitCost, line.marginPercent);
    return {
      unitPrice,
      amount: new Decimal(unitPrice).mul(line.quantity).toNumber(),
    };
  });
  const subtotal = lines.reduce(
    (sum, line) => sum.plus(line.amount),
    new Decimal(0),
  );

  const discount = roundVnd(
    input.discountType === DiscountType.PERCENT
      ? subtotal.mul(input.discountValue).div(100)
      : new Decimal(input.discountValue),
  );
  if (discount.gt(subtotal)) {
    throw new BadRequestException('The discount cannot exceed the subtotal.');
  }
  const taxable = subtotal.minus(discount);
  const vat = roundVnd(taxable.mul(input.vatRate).div(100));
  const total = taxable.plus(vat);

  const pricing: QuotationPricing = {
    lines,
    subtotal: subtotal.toNumber(),
    discountAmount: discount.toNumber(),
    taxable: taxable.toNumber(),
    vatAmount: vat.toNumber(),
    total: total.toNumber(),
  };
  const biggest = Math.max(
    pricing.subtotal,
    pricing.discountAmount,
    pricing.taxable,
    pricing.vatAmount,
    pricing.total,
    ...lines.flatMap((line) => [line.unitPrice, line.amount]),
  );
  if (biggest > MAX_QUOTATION_AMOUNT) {
    throw new BadRequestException(
      `An amount of the quotation exceeds ${MAX_QUOTATION_AMOUNT.toLocaleString('en-US')} VND.`,
    );
  }
  return pricing;
}
