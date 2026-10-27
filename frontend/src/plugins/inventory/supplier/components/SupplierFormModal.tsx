"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import React, { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { FormCheckbox } from "@/kernel/core/components/ui/FormCheckbox";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { useFormApiErrorReporter } from "@/kernel/core/hooks/useFormApiErrorReporter";

import {
  useCreateSupplier,
  useUpdateSupplier,
} from "@plugins/inventory/supplier/hooks/api/useSupplier";
import { useSupplierFormSchema } from "@plugins/inventory/supplier/hooks/useSupplierFormSchema";
import {
  EMPTY_SUPPLIER_FORM,
  toSupplierCreatePayload,
  toSupplierFormValues,
  toSupplierUpdatePayload,
} from "@plugins/inventory/supplier/utils/form-payload";
import { mapSupplierApiErrorsToForm } from "@plugins/inventory/supplier/utils/map-supplier-api-errors";

import type {
  SupplierFormInput,
  SupplierFormValues,
} from "@plugins/inventory/supplier/schemas/supplier.schema";
import type { Supplier } from "@plugins/inventory/supplier/types";

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The supplier being edited; absent when adding a new one. */
  supplier?: Supplier | null;
}

export function SupplierFormModal({
  isOpen,
  onClose,
  supplier,
}: SupplierFormModalProps) {
  const t = useTranslations("supplier");
  const tCommon = useTranslations("common");
  const { schema, tValidation } = useSupplierFormSchema();
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();

  const form = useForm<SupplierFormInput>({
    resolver: zodResolver(schema) as Resolver<SupplierFormInput>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: EMPTY_SUPPLIER_FORM,
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset(supplier ? toSupplierFormValues(supplier) : EMPTY_SUPPLIER_FORM);
  }, [isOpen, supplier, form]);

  const handleApiError = useFormApiErrorReporter(form, "supplier.toast");

  const handleSave = async (data: SupplierFormInput) => {
    const values = data as SupplierFormValues;
    try {
      if (supplier) {
        await updateMutation.mutateAsync({
          id: supplier.id,
          data: toSupplierUpdatePayload(values),
        });
      } else {
        await createMutation.mutateAsync(toSupplierCreatePayload(values));
      }
      onClose();
    } catch (error: unknown) {
      handleApiError(error, (setFieldError) =>
        mapSupplierApiErrorsToForm(
          error,
          setFieldError,
          { codeExists: tValidation("codeExists") },
          tValidation,
        ),
      );
    }
  };

  const {
    register,
    formState: { errors },
    watch,
    setValue,
  } = form;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        supplier
          ? t("editModalTitle", { code: supplier.code })
          : t("addModalTitle")
      }
      onSubmit={form.handleSubmit(handleSave)}
      submitLabel={tCommon("save")}
      cancelLabel={tCommon("cancel")}
      wide
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[11px]">
        <FormInput
          label={t("code")}
          type="text"
          required
          placeholder={t("placeholders.code")}
          error={errors.code?.message}
          {...register("code")}
        />

        <FormCheckbox
          label={t("isActive")}
          checked={Boolean(watch("isActive"))}
          onChange={(checked) => setValue("isActive", checked)}
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
          label={t("taxCode")}
          type="text"
          placeholder={t("placeholders.taxCode")}
          error={errors.taxCode?.message}
          {...register("taxCode")}
        />

        <FormInput
          label={t("contactName")}
          type="text"
          placeholder={t("placeholders.contactName")}
          error={errors.contactName?.message}
          {...register("contactName")}
        />

        <FormInput
          label={t("phone")}
          type="text"
          placeholder={t("placeholders.phone")}
          error={errors.phone?.message}
          {...register("phone")}
        />

        <FormInput
          label={t("email")}
          type="text"
          placeholder={t("placeholders.email")}
          error={errors.email?.message}
          {...register("email")}
        />

        <FormInput
          label={t("address")}
          type="text"
          span2
          placeholder={t("placeholders.address")}
          error={errors.address?.message}
          {...register("address")}
        />

        <FormTextArea
          label={t("note")}
          span2
          placeholder={t("placeholders.note")}
          error={errors.note?.message}
          {...register("note")}
        />
      </div>
    </Modal>
  );
}
