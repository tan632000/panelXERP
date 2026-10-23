import {
  collectMigrationFilenameViolations,
  validateMigrationFilename,
} from '@kernel/core/database/validate-migration-filenames.util';

describe('validateMigrationFilename', () => {
  it('accepts a real epoch millisecond prefix', () => {
    expect(
      validateMigrationFilename(
        '1787039703824-init-product-sfg-document-sequence.ts',
        { allowLegacy: false },
      ),
    ).toBeNull();
  });

  it('rejects padded timestamps ending with 00000', () => {
    expect(
      validateMigrationFilename(
        '1787035000000-init-product-sfg-document-sequence.ts',
        { allowLegacy: false },
      ),
    ).toContain('looks padded');
  });

  it('rejects filenames without a 13-digit prefix', () => {
    expect(
      validateMigrationFilename('init-product.ts', { allowLegacy: false }),
    ).toContain('Invalid migration filename');
  });

  it('allows known legacy padded migrations by default', () => {
    expect(
      validateMigrationFilename('1787040000000-init-other-material.ts'),
    ).toBeNull();
  });

  it('flags legacy padded migrations in strict mode', () => {
    const violations = collectMigrationFilenameViolations(
      ['1787040000000-init-other-material.ts'],
      { allowLegacy: false },
    );
    expect(violations).toHaveLength(1);
  });
});
