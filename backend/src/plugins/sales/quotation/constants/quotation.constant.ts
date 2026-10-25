/** Document code suffix — codes read `03-08092026/BG`: sequence of the day, date, `BG`. */
export const QUOTATION_CODE_PREFIX = 'BG';

/** Physical table and the unique index over its code, named for the retry on a lost race. */
export const QUOTATION_TABLE = 'sales_quotations';
export const QUOTATION_CODE_UNIQUE_INDEX = 'uq_sales_quotations_code';

/** VAT rates a quotation may carry, in percent; one rate per version. */
export const VAT_RATES = [0, 5, 8, 10] as const;
export type VatRate = (typeof VAT_RATES)[number];
export const DEFAULT_VAT_RATE: VatRate = 8;

/** Margin per panel, percent, up to 2 decimals. */
export const MAX_MARGIN_PERCENT = 1000;
/** Percent discount, up to 2 decimals. */
export const MAX_DISCOUNT_PERCENT = 100;

/**
 * Largest amount any stored figure may reach (VND): below 2^53, so the numbers the API returns
 * are exact, and far below what `numeric(18,2)` holds even after a 1000% margin. It also
 * bounds a fixed discount.
 */
export const MAX_QUOTATION_AMOUNT = 1_000_000_000_000_000;
