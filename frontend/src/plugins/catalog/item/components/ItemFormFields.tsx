"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";

import { ITEM_GROUPS } from "@plugins/catalog/item/constants";

import type { ItemFormInput } from "@plugins/catalog/item/schemas/item.schema";
import type { Item } from "@plugins/catalog/item/types";
import type { UseFormReturn } from "react-hook-form";

interface ItemFormFieldsProps {
  form: UseFormReturn<ItemFormInput>;
  /** The item being edited; absent when creating one. */
  item?: Item;
}

export function ItemFormFields({ form, item }: ItemFormFieldsProps) {
  const t = useTranslations("item");
  const {
    register,
    formState: { errors },
    watch,
    setValue,
  } = form;

  const groupOptions = ITEM_GROUPS.map((group) => ({
    value: group,
    label: t(`groups.${group}`),
  }));

  return (
    <div className="grid grid-cols-1 gap-[11px] md:grid-cols-2">
      <FormInput
        label={t("code")}
        // The code is the part number documents snapshot, so it is fixed once created.
        readOnly={Boolean(item)}
        type="text"
        required
        placeholder={t("placeholders.code")}
        error={errors.code?.message}
        {...register("code")}
      />

      <FormSelect
        label={t("group")}
        required
        value={watch("group") ?? ""}
        onChange={(e) =>
          setValue("group", e.target.value, { shouldValidate: true })
        }
        options={groupOptions}
        placeholder={t("placeholders.group")}
        allowCustomInput={false}
        error={errors.group?.message}
      />

      <FormInput
        label={t("name")}
        span2
        required
        placeholder={t("placeholders.name")}
        error={errors.name?.message}
        {...register("name")}
      />

      <FormInput
        label={t("brand")}
        type="text"
        placeholder={t("placeholders.brand")}
        error={errors.brand?.message}
        {...register("brand")}
      />

      <FormInput
        label={t("unit")}
        type="text"
        required
        placeholder={t("placeholders.unit")}
        error={errors.unit?.message}
        {...register("unit")}
      />

      <FormInput
        label={t("referencePrice")}
        type="number"
        decimalScale={2}
        allowNegative={false}
        placeholder={t("placeholders.referencePrice")}
        error={errors.referencePrice?.message}
        {...register("referencePrice")}
      />

      <FormTextArea
        label={t("specification")}
        span2
        placeholder={t("placeholders.specification")}
        error={errors.specification?.message}
        {...register("specification")}
      />

      <FormTextArea
        label={t("note")}
        span2
        placeholder={t("placeholders.note")}
        error={errors.note?.message}
        {...register("note")}
      />
    </div>
  );
}
