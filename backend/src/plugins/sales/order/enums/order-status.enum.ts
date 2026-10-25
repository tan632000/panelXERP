/**
 * Where a sales order stands. P1 exposes `open` and `cancelled`; the production and delivery
 * states are listed so the stored values never change when those phases arrive.
 */
export enum OrderStatus {
  OPEN = 'open',
  IN_PRODUCTION = 'in_production',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}
