import {
  createApiErrorFormMapper,
  createDeleteToastKeyResolver,
} from "@/kernel/core/lib/api-error-mapping";

export type RequestToastKey =
  | "statusConflict"
  | "engineerInvalid"
  | "quotationConfirmed"
  | "attachmentLimit"
  | "attachmentTypeInvalid"
  | "attachmentContentInvalid"
  | "attachmentTooLarge"
  | "attachmentGone";

export const mapRequestApiErrorsToForm = createApiErrorFormMapper<
  Record<string, never>
>({
  // Keys resolve against `request.validation`, so a rejection the server phrases in
  // English for the log reaches the input as the same sentence the form uses itself.
  fieldMatchers: [
    [["customer is required"], "customerId", "customerRequired"],
    [["title is required"], "title", "titleRequired"],
    [["title must not exceed"], "title", "titleMax"],
    [
      ["technical requirements must"],
      "technicalRequirements",
      "requirementsMax",
    ],
    [["active project"], "projectId", "projectInvalid"],
    [["active contact"], "contactId", "contactInvalid"],
    [["requesteddeliverydate"], "requestedDeliveryDate", "dateInvalid"],
    [["quotationduedate"], "quotationDueDate", "dateInvalid"],
  ],
});

/** Maps the server's refusal of an assignment, a close or a file action to a localized toast key. */
export const resolveRequestToastKey =
  createDeleteToastKeyResolver<RequestToastKey>([
    [["confirmed by the customer"], "quotationConfirmed"],
    [["can no longer", "cannot become", "cannot be"], "statusConflict"],
    [["engineer must be"], "engineerInvalid"],
    [["at most 20 files"], "attachmentLimit"],
    [["file type is not allowed"], "attachmentTypeInvalid"],
    [["file content is not"], "attachmentContentInvalid"],
    [["a file may be at most"], "attachmentTooLarge"],
    [["no longer available"], "attachmentGone"],
  ]);
