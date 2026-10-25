import {
  exportFileName,
  formatVnd,
  greetingLines,
  toRoman,
  vietnamDateParts,
} from '@plugins/sales/quotation/utils/quotation-document.util';

describe('quotation document helpers', () => {
  it.each([
    [1, 'I'],
    [2, 'II'],
    [4, 'IV'],
    [9, 'IX'],
    [14, 'XIV'],
    [40, 'XL'],
    [99, 'XCIX'],
  ])('writes %i as %s', (value, roman) => {
    expect(toRoman(value)).toBe(roman);
  });

  it('reads the date on the Vietnam calendar, not UTC', () => {
    // 18:30 UTC on 24 Oct is 01:30 on 25 Oct in Hanoi.
    expect(vietnamDateParts(new Date('2026-10-24T18:30:00Z'))).toEqual({
      dd: '25',
      mm: '10',
      yyyy: '2026',
    });
  });

  it('turns a code into a safe file name', () => {
    expect(exportFileName('03-25102026/BG', 'pdf')).toBe('03-25102026-BG.pdf');
  });

  it('groups whole VND by thousands', () => {
    expect(formatVnd(3_363_511)).toBe('3.363.511');
    expect(formatVnd(0)).toBe('0');
  });

  it('names the company from the letterhead in the greeting', () => {
    expect(greetingLines('ACME CO')[0]).toMatch(/^ACME CO trân trọng/);
  });
});
