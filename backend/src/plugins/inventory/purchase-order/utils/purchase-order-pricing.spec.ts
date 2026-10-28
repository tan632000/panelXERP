import {
  lineAmount,
  priceOrder,
} from '@plugins/inventory/purchase-order/utils/purchase-order-pricing';

describe('priceOrder', () => {
  it('reproduces the worked example to the dong', () => {
    const totals = priceOrder(
      [
        { quantity: 10, unitPrice: 100000 },
        { quantity: 3, unitPrice: 123457 },
        { quantity: 2.5, unitPrice: 33333 },
      ],
      8,
    );

    expect(totals).toEqual({
      lineAmounts: ['1000000', '370371', '83333'],
      subtotal: '1453704',
      // 116 296.32 rounds down.
      vatAmount: '116296',
      total: '1570000',
    });
  });

  it('rounds a half dong up on a line', () => {
    expect(lineAmount({ quantity: 2.5, unitPrice: 33333 }).toFixed(0)).toBe(
      '83333',
    );
  });

  it('rounds on decimals, where float arithmetic would drop the half', () => {
    // 1.005 × 100 is 100.49999999999999 in float, so Math.round would give 100.
    expect(lineAmount({ quantity: 1.005, unitPrice: 100 }).toFixed(0)).toBe(
      '101',
    );
    expect(priceOrder([{ quantity: 1.005, unitPrice: 100 }], 0).total).toBe(
      '101',
    );
  });

  it('rounds VAT half-up on the subtotal, not per line', () => {
    // Two lines of 5 at 10 %: 0.5 each per line would round to 2, on the subtotal 10 → 1.
    const totals = priceOrder(
      [
        { quantity: 1, unitPrice: 5 },
        { quantity: 1, unitPrice: 5 },
      ],
      10,
    );
    expect(totals).toMatchObject({
      subtotal: '10',
      vatAmount: '1',
      total: '11',
    });
    expect(priceOrder([{ quantity: 1, unitPrice: 25 }], 10).vatAmount).toBe(
      '3',
    );
  });

  it('prices an order without VAT or without lines', () => {
    expect(priceOrder([{ quantity: 3, unitPrice: 7 }], 0)).toEqual({
      lineAmounts: ['21'],
      subtotal: '21',
      vatAmount: '0',
      total: '21',
    });
    expect(priceOrder([], 10).total).toBe('0');
  });
});
