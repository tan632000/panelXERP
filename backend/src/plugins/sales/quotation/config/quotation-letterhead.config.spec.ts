import {
  DEFAULT_LETTERHEAD,
  resolveLetterhead,
} from '@plugins/sales/quotation/config/quotation-letterhead.config';

describe('resolveLetterhead', () => {
  it('falls back to the company sheet when nothing is configured', () => {
    expect(resolveLetterhead({})).toEqual(DEFAULT_LETTERHEAD);
    expect(DEFAULT_LETTERHEAD).toEqual({
      name: 'CÔNG TY TNHH KỸ THUẬT TRÍ VINH',
      address: 'VP: LK2-09 KĐT Duyên Thái, Xã Ngọc Hồi, TP. Hà Nội',
      website: 'trivinhtech.com',
      taxCode: '0107729395',
      bankAccounts: [
        '19131127871017 Tại NH TMCP Kỹ Thương Việt Nam - CN Hội sở',
        '700037556395 Tại NH TNHH MTV Shinhan Việt Nam – Chi nhánh Trần Duy Hưng',
      ],
    });
  });

  it('takes each field from the environment independently', () => {
    const letterhead = resolveLetterhead({
      QUOTATION_LETTERHEAD_NAME: ' ACME Co. ',
      QUOTATION_LETTERHEAD_TAX_CODE: '0999999999',
      QUOTATION_LETTERHEAD_BANK_ACCOUNTS: '111 Bank A | 222 Bank B |',
    });

    expect(letterhead).toEqual({
      ...DEFAULT_LETTERHEAD,
      name: 'ACME Co.',
      taxCode: '0999999999',
      bankAccounts: ['111 Bank A', '222 Bank B'],
    });
  });

  it('ignores blank values', () => {
    expect(
      resolveLetterhead({
        QUOTATION_LETTERHEAD_NAME: '   ',
        QUOTATION_LETTERHEAD_BANK_ACCOUNTS: ' | ',
      }),
    ).toEqual(DEFAULT_LETTERHEAD);
  });

  it('hands out its own bank account list, so a caller cannot change the default', () => {
    resolveLetterhead({}).bankAccounts.push('extra');

    expect(DEFAULT_LETTERHEAD.bankAccounts).toHaveLength(2);
  });
});
