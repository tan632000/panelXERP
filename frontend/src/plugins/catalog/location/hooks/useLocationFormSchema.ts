"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { createLocationSchema } from "@plugins/catalog/location/schemas/location.schema";

export function useLocationFormSchema() {
  const t = useTranslations("location.validation");

  const schema = useMemo(
    () =>
      createLocationSchema({
        codeRequired: t("codeRequired"),
        codeMax: t("codeMax"),
        nameRequired: t("nameRequired"),
        nameMax: t("nameMax"),
        noteMax: t("noteMax"),
      }),
    [t],
  );

  return { schema, tValidation: t };
}
