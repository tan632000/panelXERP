/** Customer code prefix — codes read `KH_0001` (see `master-data-code.util`). */
export const CUSTOMER_CODE_PREFIX = 'KH_';

/** Roles whose accounts may own a customer; the owner dropdown and the owner check share it. */
export const SALES_OWNER_ROLE_CODES = ['sales', 'salesManager'] as const;
