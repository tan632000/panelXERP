import { createDeleteToastKeyResolver } from "@/kernel/core/lib/api-error-mapping";

export type EstimateToastKey =
  | "draftOpen"
  | "readOnly"
  | "requestState"
  | "alreadyExists"
  | "tagTaken"
  | "incomplete"
  | "itemInvalid"
  | "amountTooLarge";

/**
 * Maps the server's refusal of an estimate action to a localized toast key. Rules run in
 * order, so a specific wording precedes the general "cannot be" of a request state.
 */
export const resolveEstimateToastKey =
  createDeleteToastKeyResolver<EstimateToastKey>([
    [["still a draft"], "draftOpen"],
    [["read-only"], "readOnly"],
    [["already has an estimate"], "alreadyExists"],
    [["is already used"], "tagTaken"],
    [["at least one panel"], "incomplete"],
    [["active catalog item"], "itemInvalid"],
    [["exceeds"], "amountTooLarge"],
    [["cannot be", "cannot become"], "requestState"],
  ]);
