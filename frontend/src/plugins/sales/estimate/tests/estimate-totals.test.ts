import { describe, expect, it } from "vitest";

import {
  bomLineAmount,
  computePanelTotals,
  computeRevisionTotal,
  type PanelFigures,
} from "@plugins/sales/estimate/utils/estimate-totals";

/**
 * The same two-panel fixture the backend totals spec works out by hand: the screen's live
 * figures must equal the ones the server stores.
 */
const PANEL_A: PanelFigures = {
  quantity: 2,
  bomLines: [
    { quantity: 12.5, unitCost: 24500 },
    { quantity: 3, unitCost: 1250000.5 },
    { quantity: 1.005, unitCost: 100 },
  ],
  costLines: [{ amount: 500000 }, { amount: 1200000 }],
};
const PANEL_B: PanelFigures = {
  quantity: 1,
  bomLines: [
    { quantity: 7.25, unitCost: 80000 },
    { quantity: 2, unitCost: 15500.75 },
  ],
  costLines: [{ amount: 300000 }, { amount: 150000 }],
};

describe("estimate display totals", () => {
  it("equal the server's figures for the two-panel fixture", () => {
    expect(computePanelTotals(PANEL_A)).toEqual({
      lineAmounts: [306250, 3750002, 101],
      unitCost: 5756353,
      total: 11512706,
    });
    expect(computePanelTotals(PANEL_B).total).toBe(1061002);
    expect(computeRevisionTotal([PANEL_A, PANEL_B])).toBe(12573708);
  });

  it("round half-up where a binary float would round down", () => {
    expect(Math.round(1.005 * 100)).toBe(100);
    expect(bomLineAmount(1.005, 100)).toBe(101);
  });

  it("read half-typed or blank entries as zero rather than throwing", () => {
    expect(bomLineAmount("", "100")).toBe(0);
    expect(bomLineAmount("2", "abc")).toBe(0);
    expect(bomLineAmount("2.", "100")).toBe(200);
  });

  it("multiply the cost lines by the panel quantity too", () => {
    const panel: PanelFigures = {
      quantity: 3,
      bomLines: [{ quantity: 1, unitCost: 100 }],
      costLines: [{ amount: 50 }],
    };

    expect(computePanelTotals(panel)).toMatchObject({
      unitCost: 150,
      total: 450,
    });
  });
});
