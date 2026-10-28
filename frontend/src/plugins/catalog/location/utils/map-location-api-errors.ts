import {
  createApiErrorFormMapper,
  createDeleteToastKeyResolver,
} from "@/kernel/core/lib/api-error-mapping";

export type LocationDeleteToastKey = "deleteInUseItem";

interface LocationMessages {
  codeExists: string;
}

export const mapLocationApiErrorsToForm =
  createApiErrorFormMapper<LocationMessages>({
    // Keys resolve against `location.validation`, so a rejection the server phrases in
    // English for the log reaches the input as the same sentence the form uses itself.
    fieldMatchers: [
      [["location name is required"], "name", "nameRequired"],
      [["location name must not exceed"], "name", "nameMax"],
      [["location code must not exceed"], "code", "codeMax"],
      [["location code is required"], "code", "codeRequired"],
      [["note must"], "note", "noteMax"],
    ],
    resolveDuplicateField: (_lower, messages) => ["code", messages.codeExists],
  });

export const resolveLocationDeleteToastKey =
  createDeleteToastKeyResolver<LocationDeleteToastKey>([
    [["cannot delete", "default location"], "deleteInUseItem"],
  ]);
