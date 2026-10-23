import {
  createApiErrorFormMapper,
  createDeleteToastKeyResolver,
} from "@/kernel/core/lib/api-error-mapping";

export type CustomerDeleteToastKey = "deleteInUseDocument";

interface CustomerMessages {
  codeExists: string;
}

export const mapCustomerApiErrorsToForm =
  createApiErrorFormMapper<CustomerMessages>({
    // Keys resolve against `customer.validation`, so a rejection the server phrases in
    // English for the log reaches the input as the same sentence the form uses itself.
    fieldMatchers: [
      [["customer name is required"], "name", "nameRequired"],
      [["customer name must not exceed"], "name", "nameMax"],
      [["customer code must start with"], "code", "codePrefix"],
      [["customer code must not exceed"], "code", "codeMax"],
      [["customer code is required"], "code", "codeRequired"],
      [["tax code must"], "taxCode", "taxCodeMax"],
      [["address must"], "address", "addressMax"],
      [["phone must"], "phone", "phoneMax"],
      [["email must be"], "email", "emailInvalid"],
      [["email must not exceed"], "email", "emailMax"],
      [["note must"], "note", "noteMax"],
      [["sales owner", "assign a customer"], "salesOwnerId", "ownerNotAllowed"],
    ],
    resolveDuplicateField: (_lower, messages) => ["code", messages.codeExists],
  });

export const resolveCustomerDeleteToastKey =
  createDeleteToastKeyResolver<CustomerDeleteToastKey>([
    [["cannot delete", "referenced"], "deleteInUseDocument"],
  ]);
