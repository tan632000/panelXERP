import {
  assertMasterDataCodeUnchanged,
  isMasterDataCode,
  masterDataCodeMessage,
} from './master-data-code.util';

describe('isMasterDataCode', () => {
  it('accepts the generated all-digit shape', () => {
    expect(isMasterDataCode('VT_0001', 'VT_')).toBe(true);
  });

  it('accepts any free tail past the four-digit ordinal', () => {
    expect(isMasterDataCode('VT_0001H', 'VT_')).toBe(true);
    expect(isMasterDataCode('VT_0001H_1', 'VT_')).toBe(true);
    expect(isMasterDataCode('VT_0001_01', 'VT_')).toBe(true);
    expect(isMasterDataCode('VT_0001-A/2', 'VT_')).toBe(true);
    expect(isMasterDataCode('VT_000112313123213acdksahdfkjashfkj', 'VT_')).toBe(
      true,
    );
  });

  it('refuses an ordinal that is not four digits', () => {
    expect(isMasterDataCode('VT_001', 'VT_')).toBe(false);
    expect(isMasterDataCode('VT_xxxx', 'VT_')).toBe(false);
    expect(isMasterDataCode('VT_00A1', 'VT_')).toBe(false);
    expect(isMasterDataCode('VT_a1b2c3', 'VT_')).toBe(false);
    // A tail may start right after the fourth digit, never before it.
    expect(isMasterDataCode('VT_001H0', 'VT_')).toBe(false);
  });

  it('refuses an inner space, so a code stays one token', () => {
    expect(isMasterDataCode('VT_00 01', 'VT_')).toBe(false);
    expect(isMasterDataCode('VT_0001 A', 'VT_')).toBe(false);
  });

  it('ignores surrounding whitespace', () => {
    expect(isMasterDataCode('  VT_0001  ', 'VT_')).toBe(true);
  });

  it('refuses a code that drops or rewrites the prefix', () => {
    expect(isMasterDataCode('0001', 'VT_')).toBe(false);
    expect(isMasterDataCode('HC_0001', 'VT_')).toBe(false);
  });
});

describe('masterDataCodeMessage', () => {
  it('states the prefix, the four digits and the free tail', () => {
    expect(masterDataCodeMessage('VT_', 'Material code')).toBe(
      'Material code must start with "VT_" followed by 4 digits, then any characters without spaces.',
    );
  });
});

describe('assertMasterDataCodeUnchanged', () => {
  it('lets an edit that omits the code through', () => {
    expect(() =>
      assertMasterDataCodeUnchanged('VTK_0313', undefined),
    ).not.toThrow();
  });

  it('lets an edit that echoes the current code through', () => {
    expect(() =>
      assertMasterDataCodeUnchanged('VTK_0313', ' VTK_0313 '),
    ).not.toThrow();
  });

  it('rejects an edit that changes the code', () => {
    expect(() => assertMasterDataCodeUnchanged('VTK_0313', 'VTK_0999')).toThrow(
      'Code cannot be changed after creation.',
    );
  });
});
