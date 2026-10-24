"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { createProjectSchema } from "@plugins/crm/project/schemas/project.schema";

export function useProjectFormSchema() {
  const t = useTranslations("project.validation");

  const schema = useMemo(
    () =>
      createProjectSchema({
        codeRequired: t("codeRequired"),
        codeMax: t("codeMax"),
        codePrefix: t("codePrefix"),
        customerRequired: t("customerRequired"),
        nameRequired: t("nameRequired"),
        nameMax: t("nameMax"),
        siteAddressMax: t("siteAddressMax"),
        noteMax: t("noteMax"),
      }),
    [t],
  );

  return { schema, tValidation: t };
}
