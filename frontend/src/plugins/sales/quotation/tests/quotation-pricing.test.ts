import { describe, expect, it } from "vitest";

import {
  parseDiscount,
  parseMargin,
} from "@plugins/sales/quotation/utils/quotation-drafts";
import {
  computeQuotationFigures,
  panelUnitPrice,
  toRoman,
} from "@plugins/sales/quotation/utils/quotation-pricing";

/** The worked example of the pricing rule: two panels, 5% discount, 8% VAT. */
const WORKED = {
  lines: [
    { unitCost: 1234567, marginPercent: 12.5, quantity: 2 },
    { unitCost: 500000, marginPercent: 0.1, quantity: 1 },
  ],
  discountType: "percent" as const,
  discountValue: 5,
  vatRate: 8,
};

describe("quotation display figures", () => {
  it("reproduces the worked example exactly", () => {
    expect(computeQuotationFigures(WORKED)).toEqual({
      lines: [
        { unitPrice: 1388888, amount: 2777776 },
        { unitPrice: 500500, amount: 500500 },
      ],
      subtotal: 3278276,
      discountAmount: 163914,
      taxable: 3114362,
      vatAmount: 249149,
      total: 3363511,
      discountTooLarge: false,
    });
  });

  it("rounds half-up where a JS float rounds down: cost 100, margin 0.5% → 101", () => {
    expect(panelUnitPrice(100, 0.5)).toBe(101);
    // The counterexample the probe exists for.
    expect(Math.round(100 * (1 + 0.5 / 100))).toBe(100);
  });

  it("takes a fixed discount as an amount", () => {
    const figures = computeQuotationFigures({
      ...WORKED,
      discountType: "amount",
      discountValue: 278276.5,
    });

    expect(figures).toMatchObject({
      discountAmount: 278277,
      taxable: 2999999,
      vatAmount: 240000,
      total: 3239999,
    });
  });

  it("flags a discount above the subtotal instead of going negative", () => {
    const figures = computeQuotationFigures({
      ...WORKED,
      discountType: "amount",
      discountValue: 3278277,
    });

    expect(figures.discountTooLarge).toBe(true);
    expect(figures.total).toBeGreaterThan(0);
  });

  it("counts a blank or unparseable field as zero while it is being typed", () => {
    const figures = computeQuotationFigures({
      lines: [{ unitCost: 1000, marginPercent: "", quantity: 2 }],
      discountType: "percent",
      discountValue: "",
      vatRate: 0,
    });

    expect(figures).toMatchObject({ subtotal: 2000, total: 2000 });
  });
});

describe("quotation field checks", () => {
  it.each([
    ["0", 0],
    ["12.5", 12.5],
    ["1000", 1000],
    ["0.01", 0.01],
  ])("accepts the margin %s", (raw, value) => {
    expect(parseMargin(raw)).toBe(value);
  });

  it.each(["", "-1", "1000.01", "0.001", "abc"])(
    "rejects the margin %j",
    (raw) => {
      expect(parseMargin(raw)).toBeNull();
    },
  );

  it("limits a percent discount to 100 and leaves an amount uncapped", () => {
    expect(parseDiscount("100", "percent")).toBe(100);
    expect(parseDiscount("100.01", "percent")).toBeNull();
    expect(parseDiscount("5000000", "amount")).toBe(5000000);
    expect(parseDiscount("1.005", "amount")).toBeNull();
  });
});

describe("toRoman", () => {
  it("numbers panels the way the company quotation does", () => {
    expect([1, 2, 3, 4, 5, 9, 10, 14].map(toRoman)).toEqual([
      "I",
      "II",
      "III",
      "IV",
      "V",
      "IX",
      "X",
      "XIV",
    ]);
  });
});
