import { UnprocessableEntityException } from '@nestjs/common';

import {
  CODE128_PATTERNS,
  encodeCode128B,
} from '@plugins/catalog/item/utils/code128.util';

/** Reads module widths back into the text they encode, checking start, checksum and stop. */
function decode(widths: number[]): string {
  const symbols: number[] = [];
  let at = 0;
  while (at < widths.length) {
    const isStop = widths.length - at === 7;
    const pattern = widths.slice(at, at + (isStop ? 7 : 6)).join('');
    const value = CODE128_PATTERNS.indexOf(pattern);
    if (value < 0) throw new Error(`Unknown pattern ${pattern}`);
    symbols.push(value);
    at += pattern.length;
  }
  const [start, ...rest] = symbols;
  const stop = rest.pop();
  const checksum = rest.pop();
  const data = rest;
  const expected =
    (start + data.reduce((sum, value, index) => sum + value * (index + 1), 0)) %
    103;
  expect(start).toBe(104);
  expect(stop).toBe(106);
  expect(checksum).toBe(expected);
  return data.map((value) => String.fromCharCode(value + 32)).join('');
}

describe('encodeCode128B', () => {
  it('encodes "PJ" as start B, 48, 42, checksum 30, stop 106', () => {
    const symbol = encodeCode128B('PJ');

    expect(symbol.values).toEqual([104, 48, 42, 30, 106]);
    expect(symbol.checksum).toBe(30);
  });

  it('weights each character by its position in the checksum', () => {
    // 104 + 33*1 + 33*2 = 203 -> 100; an unweighted sum would give 170 -> 67.
    expect(encodeCode128B('AA').checksum).toBe((104 + 33 + 33 * 2) % 103);
    expect(encodeCode128B('AA').checksum).not.toBe((104 + 33 + 33) % 103);
  });

  it.each(['A-01', 'LC1D09M7', 'Ab 9~!', ' '])(
    'round-trips %j through module widths',
    (text) => {
      expect(decode(encodeCode128B(text).widths)).toBe(text);
    },
  );

  it('makes every symbol 11 modules wide and the stop 13', () => {
    const { widths } = encodeCode128B('A-01');
    const total = widths.reduce((sum, width) => sum + width, 0);

    expect(total).toBe(11 * (1 + 4 + 1) + 13);
    expect(widths).toHaveLength(6 * 6 + 7);
  });

  it('has 107 distinct patterns of the right width', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((pattern, value) => {
      const sum = Array.from(pattern, Number).reduce((a, b) => a + b, 0);
      expect(sum).toBe(value === 106 ? 13 : 11);
    });
  });

  it.each(['Bộ', 'a\tb', 'é', ''])('answers 422 to %j', (text) => {
    expect(() => encodeCode128B(text)).toThrow(UnprocessableEntityException);
  });
});
