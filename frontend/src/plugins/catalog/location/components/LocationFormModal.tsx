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
  useCreateLocation,
  useUpdateLocation,
} from "@plugins/catalog/location/hooks/api/useLocation";
import { useLocationFormSchema } from "@plugins/catalog/location/hooks/useLocationFormSchema";
import {
  EMPTY_LOCATION_FORM,
  toLocationCreatePayload,
  toLocationFormValues,
  toLocationUpdatePayload,
} from "@plugins/catalog/location/utils/form-payload";
import { mapLocationApiErrorsToForm } from "@plugins/catalog/location/utils/map-location-api-errors";

import type {
  LocationFormInput,
  LocationFormValues,
} from "@plugins/catalog/location/schemas/location.schema";
import type { Location } from "@plugins/catalog/location/types";

interface LocationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The location being edited; absent when adding a new one. */
  location?: Location | null;
}

export function LocationFormModal({
  isOpen,
  onClose,
  location,
}: LocationFormModalProps) {
  const t = useTranslations("location");
  const tCommon = useTranslations("common");
  const { schema, tValidation } = useLocationFormSchema();
  const createMutation = useCreateLocation();
  const updateMutation = useUpdateLocation();

  const form = useForm<LocationFormInput>({
    resolver: zodResolver(schema) as Resolver<LocationFormInput>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: EMPTY_LOCATION_FORM,
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset(location ? toLocationFormValues(location) : EMPTY_LOCATION_FORM);
  }, [isOpen, location, form]);

  const handleApiError = useFormApiErrorReporter(form, "location.toast");

  const handleSave = async (data: LocationFormInput) => {
    const values = data as LocationFormValues;
    try {
      if (location) {
        await updateMutation.mutateAsync({
          id: location.id,
          data: toLocationUpdatePayload(values),
        });
      } else {
        await createMutation.mutateAsync(toLocationCreatePayload(values));
      }
      onClose();
    } catch (error: unknown) {
      handleApiError(error, (setFieldError) =>
        mapLocationApiErrorsToForm(
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
        location
          ? t("editModalTitle", { code: location.code })
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
