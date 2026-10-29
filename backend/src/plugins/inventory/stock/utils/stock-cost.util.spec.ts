import { Decimal } from 'decimal.js';

import {
  averageCost,
  exceedsQuantityPrecision,
  inbound,
  onHandAfter,
  outbound,
  supplierReturn,
  type CostedMovement,
  type StockState,
} from '@plugins/inventory/stock/utils/stock-cost.util';

const d = (value: string | number) => new Decimal(value);

function apply(state: StockState, movement: CostedMovement): StockState {
  return { onHand: movement.onHandAfter, value: movement.valueAfter };
}

describe('weighted-average costing — the worked example of one item', () => {
  const empty: StockState = { onHand: d(0), value: d(0) };
  const values: Decimal[] = [];
  let state = empty;

  const post = (movement: CostedMovement) => {
    values.push(movement.value);
    state = apply(state, movement);
    return movement;
  };

  it('1. receipt 10 @ 100 000', () => {
    const m = post(inbound(state, d(10), d(100000)));
    expect(m.value.toString()).toBe('1000000');
    expect(state.onHand.toString()).toBe('10');
    expect(state.value.toString()).toBe('1000000');
    expect(averageCost(state).toFixed(4)).toBe('100000.0000');
  });

  it('2. receipt 5 @ 130 000', () => {
    const m = post(inbound(state, d(5), d(130000)));
    expect(m.value.toString()).toBe('650000');
    expect(state.onHand.toString()).toBe('15');
    expect(state.value.toString()).toBe('1650000');
    expect(averageCost(state).toFixed(4)).toBe('110000.0000');
  });

  it('3. issue 4 at the average', () => {
    const m = post(outbound(state, d(4)));
    expect(m.value.toString()).toBe('-440000');
    expect(m.unitCost.toFixed(4)).toBe('110000.0000');
    expect(state.onHand.toString()).toBe('11');
    expect(state.value.toString()).toBe('1210000');
  });

  it('4. receipt 3 @ 123 457', () => {
    const m = post(inbound(state, d(3), d(123457)));
    expect(m.value.toString()).toBe('370371');
    expect(state.onHand.toString()).toBe('14');
    expect(state.value.toString()).toBe('1580371');
    expect(averageCost(state).toFixed(4)).toBe('112883.6429');
  });

  it('5. issue 2.5 at the rounded average', () => {
    const m = post(outbound(state, d('2.5')));
    expect(m.value.toString()).toBe('-282209');
    expect(state.onHand.toString()).toBe('11.5');
    expect(state.value.toString()).toBe('1298162');
    expect(averageCost(state).toFixed(4)).toBe('112883.6522');
  });

  it('6. issue 12 would leave −0.5, so it is refused before costing', () => {
    expect(onHandAfter(state, d(-12)).toString()).toBe('-0.5');
  });

  it('7. issue 11.5 takes the whole remaining value', () => {
    const m = post(outbound(state, d('11.5')));
    expect(m.value.toString()).toBe('-1298162');
    expect(state.onHand.toString()).toBe('0');
    expect(state.value.toString()).toBe('0');
    // The emptied item keeps the average it left at, for a later opening count.
    expect(m.avgCostAfter.toFixed(4)).toBe('112883.6522');
    const sum = values.reduce((total, v) => total.plus(v), d(0));
    expect(sum.toString()).toBe(state.value.toString());
  });
});

describe('weighted-average costing — exact decimals', () => {
  const empty: StockState = { onHand: d(0), value: d(0) };

  it('8a. receipts 0.1 + 0.2 then an issue of 0.3 leave exactly nothing', () => {
    let state = empty;
    for (const quantity of ['0.1', '0.2']) {
      const m = inbound(state, d(quantity), d(1000));
      state = apply(state, m);
    }
    const out = outbound(state, d('0.3'));
    expect(out.onHandAfter.isZero()).toBe(true);
    expect(out.valueAfter.isZero()).toBe(true);
    // The float sum the ledger must not compute.
    expect(0.1 + 0.2 - 0.3).not.toBe(0);
  });

  it('8b. receipt 1.005 @ 100 is worth 101, where a float gives 100', () => {
    expect(inbound(empty, d('1.005'), d(100)).value.toString()).toBe('101');
    expect(Math.round(1.005 * 100)).toBe(100);
  });

  it('never takes more value than the item holds when the rounded average overshoots', () => {
    // 6.66667 rounds up to 6.6667, so 99 999.999 × 6.6667 = 666 670 exceeds the 666 667 held.
    const state: StockState = { onHand: d(100000), value: d(666667) };
    expect(averageCost(state).toFixed(4)).toBe('6.6667');
    const m = outbound(state, d('99999.999'));
    expect(m.value.toString()).toBe('-666667');
    expect(m.valueAfter.toString()).toBe('0');
  });

  it('rejects quantities finer than the 3 decimals the ledger stores', () => {
    expect(exceedsQuantityPrecision(d('0.001'))).toBe(false);
    expect(exceedsQuantityPrecision(d('0.0001'))).toBe(true);
  });
});

describe('supplier returns at the purchase price', () => {
  it('drops the value by the PO receipt value: 3 of 15 worth 1 650 000 at 130 000', () => {
    const m = supplierReturn(
      { onHand: d(15), value: d(1650000) },
      d(3),
      d(130000),
    );
    expect(m.value.toString()).toBe('-390000');
    expect(m.referenceValue?.toString()).toBe('390000');
    expect(m.valueAfter.toString()).toBe('1260000');
    expect(m.avgCostAfter.toFixed(4)).toBe('105000.0000');
    // At the average it would leave 1 320 000, an average of 110 000.
  });

  it('takes the whole remaining value with the last unit, whatever the PO price', () => {
    const last = { onHand: d(1), value: d(150000) };
    for (const price of [100000, 200000]) {
      const m = supplierReturn(last, d(1), d(price));
      expect(m.value.toString()).toBe('-150000');
      expect(m.referenceValue?.toString()).toBe(String(price));
      expect(m.onHandAfter.toString()).toBe('0');
      expect(m.valueAfter.toString()).toBe('0');
    }
  });

  it('never lets the value go below 0 on a partial return', () => {
    const m = supplierReturn(
      { onHand: d(2), value: d(100000) },
      d(1),
      d(130000),
    );
    expect(m.value.toString()).toBe('-100000');
    expect(m.referenceValue?.toString()).toBe('130000');
    expect(m.onHandAfter.toString()).toBe('1');
    expect(m.valueAfter.toString()).toBe('0');
    // The last unit then leaves worth nothing.
    const after = outbound(
      { onHand: m.onHandAfter, value: m.valueAfter },
      d(1),
    );
    expect(after.value.isZero()).toBe(true);
  });
});
