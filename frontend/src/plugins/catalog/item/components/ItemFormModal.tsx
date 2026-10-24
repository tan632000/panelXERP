"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import React, { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Modal } from "@/kernel/core/components/ui/Modal";
import { useFormApiErrorReporter } from "@/kernel/core/hooks/useFormApiErrorReporter";

import {
  useCreateItem,
  useUpdateItem,
} from "@plugins/catalog/item/hooks/api/useItem";
import { useItemFormSchema } from "@plugins/catalog/item/hooks/useItemFormSchema";
import {
  EMPTY_ITEM_FORM,
  toItemCreatePayload,
  toItemFormValues,
  toItemUpdatePayload,
} from "@plugins/catalog/item/utils/form-payload";
import { mapItemApiErrorsToForm } from "@plugins/catalog/item/utils/map-item-api-errors";

import { ItemFormFields } from "./ItemFormFields";

import type {
  ItemFormInput,
  ItemFormValues,
} from "@plugins/catalog/item/schemas/item.schema";
import type { Item } from "@plugins/catalog/item/types";

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The item being edited; absent when creating a new one. */
  item?: Item | null;
}

export function ItemFormModal({ isOpen, onClose, item }: ItemFormModalProps) {
  const t = useTranslations("item");
  const tCommon = useTranslations("common");
  const { schema, tValidation } = useItemFormSchema();
  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem();

  const form = useForm<ItemFormInput>({
    resolver: zodResolver(schema) as Resolver<ItemFormInput>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: EMPTY_ITEM_FORM,
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset(item ? toItemFormValues(item) : EMPTY_ITEM_FORM);
  }, [isOpen, item, form]);

  const handleApiError = useFormApiErrorReporter(form, "item.toast");

  const handleSave = async (data: ItemFormInput) => {
    const values = data as ItemFormValues;
    try {
      if (item) {
        await updateMutation.mutateAsync({
          id: item.id,
          data: toItemUpdatePayload(values),
        });
      } else {
        await createMutation.mutateAsync(toItemCreatePayload(values));
      }
      onClose();
    } catch (error: unknown) {
      handleApiError(error, (setFieldError) =>
        mapItemApiErrorsToForm(
          error,
          setFieldError,
          { codeExists: tValidation("codeExists") },
          tValidation,
        ),
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        item ? t("editModalTitle", { code: item.code }) : t("addModalTitle")
      }
      onSubmit={form.handleSubmit(handleSave)}
      submitLabel={tCommon("save")}
      cancelLabel={tCommon("cancel")}
      wide
    >
      <ItemFormFields form={form} item={item ?? undefined} />
    </Modal>
  );
}
