"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { createContactSchema } from "@plugins/crm/contact/schemas/contact.schema";

export function useContactFormSchema() {
  const t = useTranslations("contact.validation");

  const schema = useMemo(
    () =>
      createContactSchema({
        nameRequired: t("nameRequired"),
        nameMax: t("nameMax"),
        positionMax: t("positionMax"),
        phoneMax: t("phoneMax"),
        emailInvalid: t("emailInvalid"),
        emailMax: t("emailMax"),
      }),
    [t],
  );

  return { schema, tValidation: t };
}
