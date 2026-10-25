/** The company block at the top of the customer-facing quotation. */
export interface Letterhead {
  name: string;
  address: string;
  website: string;
  taxCode: string;
  bankAccounts: string[];
}

/** The values of the company's own quotation sheet. */
export const DEFAULT_LETTERHEAD: Readonly<Letterhead> = {
  name: 'CÔNG TY TNHH KỸ THUẬT TRÍ VINH',
  address: 'VP: LK2-09 KĐT Duyên Thái, Xã Ngọc Hồi, TP. Hà Nội',
  website: 'trivinhtech.com',
  taxCode: '0107729395',
  bankAccounts: [
    '19131127871017 Tại NH TMCP Kỹ Thương Việt Nam - CN Hội sở',
    '700037556395 Tại NH TNHH MTV Shinhan Việt Nam – Chi nhánh Trần Duy Hưng',
  ],
};

/**
 * The letterhead from the environment, field by field falling back to the default. Bank
 * accounts come as one `|`-separated value. No person's phone or email belongs here: the
 * sender block of a quotation is its sales owner's own account.
 */
export function resolveLetterhead(
  env: NodeJS.ProcessEnv = process.env,
): Letterhead {
  const text = (name: string, fallback: string): string =>
    env[name]?.trim() || fallback;
  const accounts = (env.QUOTATION_LETTERHEAD_BANK_ACCOUNTS ?? '')
    .split('|')
    .map((account) => account.trim())
    .filter(Boolean);
  return {
    name: text('QUOTATION_LETTERHEAD_NAME', DEFAULT_LETTERHEAD.name),
    address: text('QUOTATION_LETTERHEAD_ADDRESS', DEFAULT_LETTERHEAD.address),
    website: text('QUOTATION_LETTERHEAD_WEBSITE', DEFAULT_LETTERHEAD.website),
    taxCode: text('QUOTATION_LETTERHEAD_TAX_CODE', DEFAULT_LETTERHEAD.taxCode),
    bankAccounts:
      accounts.length > 0 ? accounts : [...DEFAULT_LETTERHEAD.bankAccounts],
  };
}
