import {
  bomLineAmount,
  computePanelTotals,
  computeRevisionTotals,
  costLineAmount,
  type PanelFigures,
} from '@plugins/sales/estimate/services/estimate-totals';

/**
 * Worked by hand (VND):
 *
 *   Panel A, quantity 2
 *     12.5 m   cable   × 24,500.00   =   306,250
 *      3 pcs   MCCB    × 1,250,000.50 = 3,750,001.5 → 3,750,002 (half-up)
 *      1.005   gland   × 100.00       =       100.5 →       101 (half-up)
 *     design 500,000 + labor 1,200,000 = 1,700,000
 *     unit cost = 306,250 + 3,750,002 + 101 + 1,700,000 = 5,756,353
 *     total     = 5,756,353 × 2                        = 11,512,706
 *
 *   Panel B, quantity 1
 *     7.25 m   busbar × 80,000.00    =   580,000
 *      2 pcs   relay  × 15,500.75    =  31,001.5 →  31,002 (half-up)
 *     installation 300,000 + transport 150,000 = 450,000
 *     unit cost = 580,000 + 31,002 + 450,000 = 1,061,002
 *     total     = 1,061,002 × 1                = 1,061,002
 *
 *   Estimate total = 11,512,706 + 1,061,002 = 12,573,708
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

describe('estimate totals', () => {
  it('computes the two-panel fixture to the exact VND', () => {
    const totals = computeRevisionTotals([PANEL_A, PANEL_B]);

    expect(totals.panels[0]).toEqual({
      lineAmounts: [306250, 3750002, 101],
      unitCost: 5756353,
      total: 11512706,
    });
    expect(totals.panels[1]).toEqual({
      lineAmounts: [580000, 31002],
      unitCost: 1061002,
      total: 1061002,
    });
    expect(totals.total).toBe(12573708);
  });

  it('counts the cost lines once per panel built: leaving the panel quantity off them gives another number', () => {
    // The wrong reading — cost lines added after the multiplication — must not match.
    const lineSum = (panel: PanelFigures) =>
      computePanelTotals({ ...panel, costLines: [] }).unitCost;
    const costSum = (panel: PanelFigures) =>
      panel.costLines.reduce((sum, line) => sum + Number(line.amount), 0);
    const naive = [PANEL_A, PANEL_B].reduce(
      (sum, panel) =>
        sum + lineSum(panel) * Number(panel.quantity) + costSum(panel),
      0,
    );

    // Panel A: 4,056,353 × 2 + 1,700,000 = 9,812,706; panel B: 1,061,002.
    expect(naive).toBe(10873708);
    expect(naive).not.toBe(computeRevisionTotals([PANEL_A, PANEL_B]).total);
  });

  it('rounds half-up where a binary float would round down', () => {
    // 1.005 × 100 is 100.5: Math.round(1.005 * 100) gives 100, half-up gives 101.
    expect(Math.round(1.005 * 100)).toBe(100);
    expect(bomLineAmount(1.005, 100)).toBe(101);
    expect(bomLineAmount('2', '15500.75')).toBe(31002);
    expect(bomLineAmount('0.001', '499')).toBe(0);
    expect(bomLineAmount('0.001', '500')).toBe(1);
    expect(costLineAmount('1000.5')).toBe(1001);
    expect(costLineAmount('1000.49')).toBe(1000);
  });

  it('accepts string decimals as the database returns them', () => {
    expect(bomLineAmount('12.500', '24500.00')).toBe(306250);
    const totals = computePanelTotals({
      quantity: '3',
      bomLines: [{ quantity: '0.1', unitCost: '0.2' }],
      costLines: [],
    });
    // 0.1 × 0.2 is 0.02 exactly in decimal arithmetic, not 0.020000000000000004.
    expect(totals.lineAmounts).toEqual([0]);
    expect(totals.total).toBe(0);
  });

  it('is zero for an empty panel and an empty estimate', () => {
    expect(
      computePanelTotals({ quantity: 5, bomLines: [], costLines: [] }),
    ).toEqual({ lineAmounts: [], unitCost: 0, total: 0 });
    expect(computeRevisionTotals([])).toEqual({ panels: [], total: 0 });
  });

  it('sums many small lines without float drift', () => {
    const bomLines = Array.from({ length: 1000 }, () => ({
      quantity: 0.1,
      unitCost: 10,
    }));
    // Each line is exactly 1; a float sum of 0.1 × 10 a thousand times would drift.
    expect(
      computePanelTotals({ quantity: 1, bomLines, costLines: [] }).unitCost,
    ).toBe(1000);
  });
});
