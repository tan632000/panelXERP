"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import React, { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { FormCheckbox } from "@/kernel/core/components/ui/FormCheckbox";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { useFormApiErrorReporter } from "@/kernel/core/hooks/useFormApiErrorReporter";

import {
  useCreateContact,
  useUpdateContact,
} from "@plugins/crm/contact/hooks/api/useContact";
import { useContactFormSchema } from "@plugins/crm/contact/hooks/useContactFormSchema";
import {
  EMPTY_CONTACT_FORM,
  toContactCreatePayload,
  toContactFormValues,
  toContactUpdatePayload,
} from "@plugins/crm/contact/utils/form-payload";
import { mapContactApiErrorsToForm } from "@plugins/crm/contact/utils/map-contact-api-errors";

import type {
  ContactFormInput,
  ContactFormValues,
} from "@plugins/crm/contact/schemas/contact.schema";
import type { Contact } from "@plugins/crm/contact/types";

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: number;
  /** The contact being edited; absent when adding a new one. */
  contact?: Contact | null;
}

export function ContactFormModal({
  isOpen,
  onClose,
  customerId,
  contact,
}: ContactFormModalProps) {
  const t = useTranslations("contact");
  const tCommon = useTranslations("common");
  const { schema, tValidation } = useContactFormSchema();
  const createMutation = useCreateContact();
  const updateMutation = useUpdateContact();

  const form = useForm<ContactFormInput>({
    resolver: zodResolver(schema) as Resolver<ContactFormInput>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: EMPTY_CONTACT_FORM,
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset(contact ? toContactFormValues(contact) : EMPTY_CONTACT_FORM);
  }, [isOpen, contact, form]);

  const handleApiError = useFormApiErrorReporter(form, "contact.toast");

  const handleSave = async (data: ContactFormInput) => {
    const values = data as ContactFormValues;
    try {
      if (contact) {
        await updateMutation.mutateAsync({
          id: contact.id,
          data: toContactUpdatePayload(values),
        });
      } else {
        await createMutation.mutateAsync(
          toContactCreatePayload(customerId, values),
        );
      }
      onClose();
    } catch (error: unknown) {
      handleApiError(error, (setFieldError) =>
        mapContactApiErrorsToForm(error, setFieldError, {}, tValidation),
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
      title={contact ? t("editModalTitle") : t("addModalTitle")}
      onSubmit={form.handleSubmit(handleSave)}
      submitLabel={tCommon("save")}
      cancelLabel={tCommon("cancel")}
      wide
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[11px]">
        <FormInput
          label={t("name")}
          span2
          required
          placeholder={t("placeholders.name")}
          error={errors.name?.message}
          {...register("name")}
        />
        <FormInput
          label={t("position")}
          type="text"
          placeholder={t("placeholders.position")}
          error={errors.position?.message}
          {...register("position")}
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
          span2
          placeholder={t("placeholders.email")}
          error={errors.email?.message}
          {...register("email")}
        />
        <FormCheckbox
          label={t("isPrimary")}
          checked={Boolean(watch("isPrimary"))}
          onChange={(checked) => setValue("isPrimary", checked)}
          hint={t("isPrimaryHint")}
        />
      </div>
    </Modal>
  );
}
