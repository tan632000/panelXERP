"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { createSupplierSchema } from "@plugins/inventory/supplier/schemas/supplier.schema";

export function useSupplierFormSchema() {
  const t = useTranslations("supplier.validation");

  const schema = useMemo(
    () =>
      createSupplierSchema({
        codeRequired: t("codeRequired"),
        codeMax: t("codeMax"),
        nameRequired: t("nameRequired"),
        nameMax: t("nameMax"),
        taxCodeMax: t("taxCodeMax"),
        addressMax: t("addressMax"),
        phoneMax: t("phoneMax"),
        emailInvalid: t("emailInvalid"),
        emailMax: t("emailMax"),
        contactNameMax: t("contactNameMax"),
        noteMax: t("noteMax"),
      }),
    [t],
  );

  return { schema, tValidation: t };
}
