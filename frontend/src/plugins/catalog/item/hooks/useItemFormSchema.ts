"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { createItemSchema } from "@plugins/catalog/item/schemas/item.schema";

export function useItemFormSchema() {
  const t = useTranslations("item.validation");

  const schema = useMemo(
    () =>
      createItemSchema({
        codeRequired: t("codeRequired"),
        codeMax: t("codeMax"),
        nameRequired: t("nameRequired"),
        nameMax: t("nameMax"),
        specificationMax: t("specificationMax"),
        brandMax: t("brandMax"),
        groupRequired: t("groupRequired"),
        unitRequired: t("unitRequired"),
        unitMax: t("unitMax"),
        referencePriceInvalid: t("referencePriceInvalid"),
        noteMax: t("noteMax"),
        barcodeMax: t("barcodeMax"),
        minStockInvalid: t("minStockInvalid"),
      }),
    [t],
  );

  return { schema, tValidation: t };
}
