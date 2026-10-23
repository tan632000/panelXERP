import { BadRequestException } from '@nestjs/common';

import {
  assertDocumentCodeYear,
  documentCodeYear,
} from '@shared/utils/document-code-year.util';

describe('documentCodeYear', () => {
  it('reads the year segment of every generated code shape', () => {
    expect(documentCodeYear('HP-NVL-2026-0001')).toBe(2026);
    expect(documentCodeYear('PR-MH-2026-0001')).toBe(2026);
    expect(documentCodeYear('TLBH-2026-0001')).toBe(2026);
    expect(documentCodeYear('  PGH-YCMH-2025-0001  ')).toBe(2025);
  });

  it('reports a code holding no year segment', () => {
    expect(documentCodeYear('VT_0001')).toBeNull();
    expect(documentCodeYear('')).toBeNull();
  });
});

describe('assertDocumentCodeYear', () => {
  const year = new Date().getFullYear();

  it('passes a code carrying the current year', () => {
    expect(() =>
      assertDocumentCodeYear(`HP-NVL-${year}-0001`, 'nope'),
    ).not.toThrow();
  });

  it('refuses another year on create', () => {
    expect(() =>
      assertDocumentCodeYear(`HP-NVL-${year - 1}-0001`, 'nope'),
    ).toThrow(BadRequestException);
  });

  it('passes the year a record already holds on edit', () => {
    expect(() =>
      assertDocumentCodeYear(`TLBH-${year - 1}-0001`, 'nope', year - 1),
    ).not.toThrow();
  });

  it('refuses a code holding no year at all', () => {
    expect(() => assertDocumentCodeYear('TLBH-0001', 'nope')).toThrow(
      BadRequestException,
    );
  });
});
