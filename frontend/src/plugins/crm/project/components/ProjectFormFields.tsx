"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";

import { CustomerPicker } from "./CustomerPicker";

import type { ProjectFormInput } from "@plugins/crm/project/schemas/project.schema";
import type { Project } from "@plugins/crm/project/types";
import type { UseFormReturn } from "react-hook-form";

interface ProjectFormFieldsProps {
  form: UseFormReturn<ProjectFormInput>;
  /** The project being edited; absent when creating one. */
  project?: Project;
}

function customerLabel(code?: string | null, name?: string | null): string {
  return [code, name].filter(Boolean).join(" — ");
}

export function ProjectFormFields({ form, project }: ProjectFormFieldsProps) {
  const t = useTranslations("project");
  const {
    register,
    formState: { errors },
    watch,
    setValue,
  } = form;

  // The picker's popup only loads once opened, so the chosen label is kept here.
  const [pickedLabel, setPickedLabel] = useState("");

  return (
    <div className="grid grid-cols-1 gap-[11px] md:grid-cols-2">
      <FormInput
        label={project ? t("code") : t("codeAuto")}
        readOnly={Boolean(project)}
        type="text"
        required
        placeholder={t("placeholders.code")}
        error={errors.code?.message}
        {...register("code")}
      />

      {project ? (
        // The customer is fixed once the project exists: requests and orders snapshot it.
        <FormInput
          label={t("customer")}
          span2
          readOnly
          type="text"
          value={customerLabel(project.customerCode, project.customerName)}
          onChange={() => {}}
        />
      ) : (
        <CustomerPicker
          value={watch("customerId") ?? ""}
          displayLabel={pickedLabel}
          onChange={(customer) => {
            setPickedLabel(customerLabel(customer.code, customer.name));
            setValue("customerId", String(customer.id), {
              shouldValidate: true,
            });
          }}
          onClear={() => {
            setPickedLabel("");
            setValue("customerId", "", { shouldValidate: true });
          }}
          error={errors.customerId?.message}
        />
      )}

      <FormInput
        label={t("name")}
        span2
        required
        placeholder={t("placeholders.name")}
        error={errors.name?.message}
        {...register("name")}
      />

      <FormInput
        label={t("siteAddress")}
        type="text"
        span2
        placeholder={t("placeholders.siteAddress")}
        error={errors.siteAddress?.message}
        {...register("siteAddress")}
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
