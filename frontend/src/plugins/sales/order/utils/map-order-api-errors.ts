import { createDeleteToastKeyResolver } from "@/kernel/core/lib/api-error-mapping";

export type OrderToastKey =
  "notConfirmed" | "alreadyExists" | "requestCannotMove" | "orderState";

/**
 * Maps the server's refusal of an order action to a localized toast key. Rules run in order,
 * so a specific wording precedes the general "cannot be" of an order state.
 */
export const resolveOrderToastKey = createDeleteToastKeyResolver<OrderToastKey>(
  [
    [["customer-confirmed version"], "notConfirmed"],
    [["already has an order"], "alreadyExists"],
    [["cannot become"], "requestCannotMove"],
    [["and cannot be"], "orderState"],
  ],
);
