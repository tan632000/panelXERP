import { createDeleteToastKeyResolver } from "@/kernel/core/lib/api-error-mapping";

export type QuotationToastKey =
  | "readOnly"
  | "alreadyExists"
  | "noEstimate"
  | "staleRevision"
  | "requestState"
  | "discountTooLarge"
  | "amountTooLarge";

/**
 * Maps the server's refusal of a quotation action to a localized toast key. Rules run in
 * order, so a specific wording precedes the general "cannot be" of a request state.
 */
export const resolveQuotationToastKey =
  createDeleteToastKeyResolver<QuotationToastKey>([
    [["read-only"], "readOnly"],
    [["already has a quotation"], "alreadyExists"],
    [["no submitted estimate"], "noEstimate"],
    [["not the latest submitted"], "staleRevision"],
    [["cannot exceed the subtotal"], "discountTooLarge"],
    [["exceeds"], "amountTooLarge"],
    [["cannot be quoted"], "requestState"],
  ]);
