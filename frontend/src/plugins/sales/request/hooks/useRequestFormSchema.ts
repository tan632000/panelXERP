"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { createRequestSchema } from "@plugins/sales/request/schemas/request.schema";

export function useRequestFormSchema() {
  const t = useTranslations("request.validation");

  const schema = useMemo(
    () =>
      createRequestSchema({
        customerRequired: t("customerRequired"),
        titleRequired: t("titleRequired"),
        titleMax: t("titleMax"),
        requirementsMax: t("requirementsMax"),
        dateInvalid: t("dateInvalid"),
      }),
    [t],
  );

  return { schema, tValidation: t };
}
