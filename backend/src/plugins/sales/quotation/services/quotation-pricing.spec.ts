import { BadRequestException } from '@nestjs/common';

import { DiscountType } from '@plugins/sales/quotation/enums/discount-type.enum';
import {
  computeQuotationPricing,
  panelUnitPrice,
} from '@plugins/sales/quotation/services/quotation-pricing';

/** The same arithmetic on JS numbers: what the half-up probe must tell apart from the exact one. */
const floatUnitPrice = (unitCost: number, marginPercent: number): number =>
  Math.round(unitCost * (1 + marginPercent / 100));

describe('panelUnitPrice', () => {
  it('rounds half-up where a JS float would round down: cost 100, margin 0.5% → 101', () => {
    expect(panelUnitPrice(100, 0.5)).toBe(101);
    // The counterexample: Math.round on JS numbers misses it (100.49999999999999 → 100).
    expect(floatUnitPrice(100, 0.5)).toBe(100);
  });

  it('rounds a .5 up and a lower fraction down', () => {
    expect(panelUnitPrice(1_234_567, 12.5)).toBe(1_388_888); // …887.875
    expect(panelUnitPrice(10, 5)).toBe(11); // 10.5
    expect(panelUnitPrice(10, 4)).toBe(10); // 10.4
  });

  it('keeps the cost when the margin is 0', () => {
    expect(panelUnitPrice(1_234_567, 0)).toBe(1_234_567);
  });
});

describe('computeQuotationPricing', () => {
  const WORKED_EXAMPLE = {
    lines: [
      { unitCost: 1_234_567, marginPercent: 12.5, quantity: 2 },
      { unitCost: 500_000, marginPercent: 0.1, quantity: 1 },
    ],
    discountType: DiscountType.PERCENT,
    discountValue: 5,
    vatRate: 8,
  };

  it('reproduces the worked example exactly', () => {
    expect(computeQuotationPricing(WORKED_EXAMPLE)).toEqual({
      lines: [
        { unitPrice: 1_388_888, amount: 2_777_776 },
        { unitPrice: 500_500, amount: 500_500 },
      ],
      subtotal: 3_278_276,
      discountAmount: 163_914, // 163,913.8
      taxable: 3_114_362,
      vatAmount: 249_149, // 249,148.96
      total: 3_363_511,
    });
  });

  it('takes a fixed discount as an amount, rounded half-up', () => {
    const pricing = computeQuotationPricing({
      ...WORKED_EXAMPLE,
      discountType: DiscountType.AMOUNT,
      discountValue: 278_276.5,
    });

    expect(pricing).toMatchObject({
      discountAmount: 278_277, // 278,276.5
      taxable: 2_999_999, // 3,278,276 − 278,277
      vatAmount: 240_000, // 239,999.92
      total: 3_239_999,
    });
  });

  it.each([
    [0, 0],
    [5, 0.05],
    [8, 0.08],
    [10, 0.1],
  ])('applies one VAT rate of %d%% to the taxable amount', (rate, factor) => {
    const pricing = computeQuotationPricing({
      lines: [{ unitCost: 1000, marginPercent: 0, quantity: 3 }],
      discountType: DiscountType.PERCENT,
      discountValue: 0,
      vatRate: rate,
    });

    expect(pricing.vatAmount).toBe(3000 * factor);
    expect(pricing.total).toBe(3000 + 3000 * factor);
  });

  it('allows a discount equal to the subtotal', () => {
    const pricing = computeQuotationPricing({
      ...WORKED_EXAMPLE,
      discountType: DiscountType.PERCENT,
      discountValue: 100,
    });

    expect(pricing).toMatchObject({ taxable: 0, vatAmount: 0, total: 0 });
  });

  it('refuses a fixed discount above the subtotal with a 400', () => {
    expect(() =>
      computeQuotationPricing({
        ...WORKED_EXAMPLE,
        discountType: DiscountType.AMOUNT,
        discountValue: 3_278_277,
      }),
    ).toThrow(BadRequestException);
  });

  it('refuses a percent discount above 100 with a 400', () => {
    expect(() =>
      computeQuotationPricing({ ...WORKED_EXAMPLE, discountValue: 100.01 }),
    ).toThrow(BadRequestException);
  });

  it('refuses a subtotal past the cap even when every line is below it', () => {
    expect(() =>
      computeQuotationPricing({
        lines: [
          { unitCost: 600_000_000_000_000, marginPercent: 0, quantity: 1 },
          { unitCost: 600_000_000_000_000, marginPercent: 0, quantity: 1 },
        ],
        discountType: DiscountType.PERCENT,
        discountValue: 100,
        vatRate: 0,
      }),
    ).toThrow(BadRequestException);
  });

  it('refuses an amount past the cap instead of overflowing the column', () => {
    expect(() =>
      computeQuotationPricing({
        lines: [
          { unitCost: 10_000_000_000, marginPercent: 1000, quantity: 10_000 },
        ],
        discountType: DiscountType.PERCENT,
        discountValue: 0,
        vatRate: 10,
      }),
    ).toThrow(BadRequestException);
  });
});
