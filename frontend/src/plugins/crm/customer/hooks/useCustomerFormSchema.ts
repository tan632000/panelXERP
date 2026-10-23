"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { createCustomerSchema } from "@plugins/crm/customer/schemas/customer.schema";

export function useCustomerFormSchema() {
  const t = useTranslations("customer.validation");

  const schema = useMemo(
    () =>
      createCustomerSchema({
        codeRequired: t("codeRequired"),
        codeMax: t("codeMax"),
        codePrefix: t("codePrefix"),
        nameRequired: t("nameRequired"),
        nameMax: t("nameMax"),
        taxCodeMax: t("taxCodeMax"),
        addressMax: t("addressMax"),
        phoneMax: t("phoneMax"),
        emailInvalid: t("emailInvalid"),
        emailMax: t("emailMax"),
        noteMax: t("noteMax"),
      }),
    [t],
  );

  return { schema, tValidation: t };
}
