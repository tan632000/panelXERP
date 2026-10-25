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

/** Notifications: approvers on submit, the sales owner on the decision. */
export const QUOTATION_SUBMITTED_EVENT = 'sales.quotation.submitted';
export const QUOTATION_APPROVED_EVENT = 'sales.quotation.approved';
export const QUOTATION_REJECTED_EVENT = 'sales.quotation.rejected';

/** Roles that hold `quotation:approve`; they are told of a submission. */
export const QUOTATION_APPROVER_ROLE_CODES = [
  'salesManager',
  'director',
  'admin',
] as const;

/** Besides its creator, these roles may hand a draft in for approval. */
export const QUOTATION_SUBMIT_ANY_ROLE_CODES = QUOTATION_APPROVER_ROLE_CODES;

/**
 * Terms every new quotation starts with (the wording of the company's quotation sheet); each
 * version may edit its own copy while it is a draft.
 */
export const DEFAULT_QUOTATION_TERMS: readonly string[] = [
  'Thời gian bảo hành thiết bị: 12 tháng',
  'Thời gian giao hàng: 1 - 2 tuần',
  'Địa điểm giao hàng: tại xưởng bên bán',
  'Thanh toán: Tạm ứng 50% sau ký hợp đồng, thanh toán số còn lại khi có thông báo giao hàng trước khi nhận hàng.',
  'Báo giá trên có giá trị trong vòng 15 ngày kể từ ngày chào giá',
];

export const MAX_TERMS = 20;
export const MAX_TERM_LENGTH = 500;
