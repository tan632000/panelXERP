import { createApiErrorFormMapper } from "@/kernel/core/lib/api-error-mapping";

export const mapContactApiErrorsToForm = createApiErrorFormMapper<object>({
  // Keys resolve against `contact.validation`, so a rejection the server phrases in
  // English for the log reaches the input as the same sentence the form uses itself.
  fieldMatchers: [
    [["contact name is required"], "name", "nameRequired"],
    [["contact name must not exceed"], "name", "nameMax"],
    [["position must"], "position", "positionMax"],
    [["phone must"], "phone", "phoneMax"],
    [["email must be"], "email", "emailInvalid"],
    [["email must not exceed"], "email", "emailMax"],
  ],
});
