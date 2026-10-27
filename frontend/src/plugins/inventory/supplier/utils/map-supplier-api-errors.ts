import {
  createApiErrorFormMapper,
  createDeleteToastKeyResolver,
} from "@/kernel/core/lib/api-error-mapping";

export type SupplierDeleteToastKey = "deleteInUseDocument";

interface SupplierMessages {
  codeExists: string;
}

export const mapSupplierApiErrorsToForm =
  createApiErrorFormMapper<SupplierMessages>({
    // Keys resolve against `supplier.validation`, so a rejection the server phrases in
    // English for the log reaches the input as the same sentence the form uses itself.
    fieldMatchers: [
      [["supplier name is required"], "name", "nameRequired"],
      [["supplier name must not exceed"], "name", "nameMax"],
      [["supplier code must not exceed"], "code", "codeMax"],
      [["supplier code is required"], "code", "codeRequired"],
      [["tax code must"], "taxCode", "taxCodeMax"],
      [["address must"], "address", "addressMax"],
      [["phone must"], "phone", "phoneMax"],
      [["email must be"], "email", "emailInvalid"],
      [["email must not exceed"], "email", "emailMax"],
      [["contact name must"], "contactName", "contactNameMax"],
      [["note must"], "note", "noteMax"],
    ],
    resolveDuplicateField: (_lower, messages) => ["code", messages.codeExists],
  });

export const resolveSupplierDeleteToastKey =
  createDeleteToastKeyResolver<SupplierDeleteToastKey>([
    [["cannot delete", "referenced"], "deleteInUseDocument"],
  ]);
