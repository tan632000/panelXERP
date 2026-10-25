/** Document code prefix — codes read `DH_2026_0001`. */
export const ORDER_CODE_PREFIX = 'DH';

/** Physical table and the unique index over its code, named for the retry on a lost race. */
export const ORDER_TABLE = 'sales_orders';
export const ORDER_CODE_UNIQUE_INDEX = 'uq_sales_orders_code';

/** Notification: the sales owner and the order managers learn of a new order. */
export const ORDER_CREATED_EVENT = 'sales.order.created';

/** Roles that hold `order:*`; they are told of a new order besides its sales owner. */
export const ORDER_MANAGER_ROLE_CODES = [
  'salesManager',
  'director',
  'admin',
] as const;

export const MAX_CONTRACT_NO_LENGTH = 100;
