"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { useFormApiErrorReporter } from "@/kernel/core/hooks/useFormApiErrorReporter";

import {
  useCreateItem,
  useUpdateItem,
  useUpdateItemStockSettings,
} from "@plugins/catalog/item/hooks/api/useItem";
import { useItemFormSchema } from "@plugins/catalog/item/hooks/useItemFormSchema";
import { ItemPermission } from "@plugins/catalog/item/permissions/item-permission.keys";
import {
  EMPTY_ITEM_FORM,
  hasStockSettings,
  toItemCreatePayload,
  toItemFormValues,
  toItemStockSettingsPayload,
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

export function ItemFormModal({
  isOpen,
  onClose,
  item: itemProp,
}: ItemFormModalProps) {
  const t = useTranslations("item");
  const tCommon = useTranslations("common");
  const { schema, tValidation } = useItemFormSchema();
  const { can } = useAuth();
  // An actor holding only item:stock_settings sees just the "Kho" section of an existing item.
  // A new item whose warehouse settings were then refused already exists: the modal carries on
  // as an edit of it, so a second save updates it instead of creating a duplicate.
  const [created, setCreated] = useState<Item | null>(null);
  const item = itemProp ?? created;
  const canEditItem = can(item ? ItemPermission.update : ItemPermission.create);
  const canEditStock = can(ItemPermission.stockSettings);
  const canSeePrice = can(ItemPermission.referencePriceRead);
  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem();
  const stockMutation = useUpdateItemStockSettings({ announce: !canEditItem });

  const form = useForm<ItemFormInput>({
    resolver: zodResolver(schema) as Resolver<ItemFormInput>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: EMPTY_ITEM_FORM,
  });

  useEffect(() => {
    if (!isOpen) return;
    setCreated(null);
    form.reset(itemProp ? toItemFormValues(itemProp) : EMPTY_ITEM_FORM);
  }, [isOpen, itemProp, form]);

  const handleApiError = useFormApiErrorReporter(form, "item.toast");

  const handleSave = async (data: ItemFormInput) => {
    const values = data as ItemFormValues;
    try {
      if (item) {
        if (canEditItem) {
          await updateMutation.mutateAsync({
            id: item.id,
            data: toItemUpdatePayload(values, {
              includeReferencePrice: canSeePrice,
            }),
          });
        }
        if (canEditStock) {
          await stockMutation.mutateAsync({
            id: item.id,
            data: toItemStockSettingsPayload(values),
          });
        }
      } else {
        const newItem = await createMutation.mutateAsync(
          toItemCreatePayload(values),
        );
        setCreated(newItem);
        // The create API takes no warehouse fields, so they follow in a second call.
        if (canEditStock && hasStockSettings(values)) {
          await stockMutation.mutateAsync({
            id: newItem.id,
            data: toItemStockSettingsPayload(values),
          });
        }
      }
      onClose();
    } catch (error: unknown) {
      handleApiError(error, (setFieldError) =>
        mapItemApiErrorsToForm(
          error,
          setFieldError,
          {
            codeExists: tValidation("codeExists"),
            codeIsBarcode: tValidation("codeIsBarcode"),
            barcodeTaken: tValidation("barcodeTaken"),
          },
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
      <ItemFormFields
        form={form}
        item={item ?? undefined}
        showItemFields={canEditItem}
        showStockSettings={canEditStock}
        showReferencePrice={canSeePrice}
      />
    </Modal>
  );
}
