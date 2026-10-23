import { nextPrefixedNumericCode } from './max-based-code.util';

describe('nextPrefixedNumericCode', () => {
  it('pads to the default 4-digit width', () => {
    expect(nextPrefixedNumericCode('FG_0006', 'FG_')).toBe('FG_0007');
  });

  it('keeps extra leading zeros from a wider user-entered code', () => {
    expect(nextPrefixedNumericCode('FG_000733123', 'FG_')).toBe('FG_000733124');
  });

  it('widens when the next number needs another digit', () => {
    expect(nextPrefixedNumericCode('FG_9999', 'FG_')).toBe('FG_10000');
  });

  it('starts at the padded first code when the prefix does not match', () => {
    expect(nextPrefixedNumericCode('HC_0001', 'FG_')).toBe('FG_0001');
  });
});
