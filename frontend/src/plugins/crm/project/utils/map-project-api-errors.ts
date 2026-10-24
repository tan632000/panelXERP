import {
  createApiErrorFormMapper,
  createDeleteToastKeyResolver,
} from "@/kernel/core/lib/api-error-mapping";

export type ProjectDeleteToastKey = "deleteInUseDocument";

interface ProjectMessages {
  codeExists: string;
}

export const mapProjectApiErrorsToForm =
  createApiErrorFormMapper<ProjectMessages>({
    // Keys resolve against `project.validation`, so a rejection the server phrases in
    // English for the log reaches the input as the same sentence the form uses itself.
    fieldMatchers: [
      [["project name is required"], "name", "nameRequired"],
      [["project name must not exceed"], "name", "nameMax"],
      [["project code must start with"], "code", "codePrefix"],
      [["project code must not exceed"], "code", "codeMax"],
      [["project code is required"], "code", "codeRequired"],
      [["customer is required"], "customerId", "customerRequired"],
      [["site address must"], "siteAddress", "siteAddressMax"],
      [["note must"], "note", "noteMax"],
    ],
    resolveDuplicateField: (_lower, messages) => ["code", messages.codeExists],
  });

export const resolveProjectDeleteToastKey =
  createDeleteToastKeyResolver<ProjectDeleteToastKey>([
    [["cannot delete", "referenced"], "deleteInUseDocument"],
  ]);
