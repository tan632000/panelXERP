"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { DateInput } from "@/kernel/core/components/ui/DateInput";
import { FormControl } from "@/kernel/core/components/ui/FormControl";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";

import { useCustomerContacts } from "@plugins/crm/contact/hooks/api/useContact";
import { useCustomerProjectOptions } from "@plugins/sales/request/hooks/api/useRequest";

import { RequestCustomerPicker } from "./RequestCustomerPicker";

import type { RequestFormInput } from "@plugins/sales/request/schemas/request.schema";
import type { RequestDetail } from "@plugins/sales/request/types";
import type { UseFormReturn } from "react-hook-form";

interface RequestFormFieldsProps {
  form: UseFormReturn<RequestFormInput>;
  /** The request being edited; absent when creating one. */
  request?: RequestDetail;
}

function customerLabel(code?: string | null, name?: string | null): string {
  return [code, name].filter(Boolean).join(" — ");
}

export function RequestFormFields({ form, request }: RequestFormFieldsProps) {
  const t = useTranslations("request");
  const {
    register,
    formState: { errors },
    watch,
    setValue,
  } = form;

  // The picker's popup only loads once opened, so the chosen label is kept here.
  const [pickedLabel, setPickedLabel] = useState("");

  const customerId = Number(watch("customerId") || 0);
  const projectsQuery = useCustomerProjectOptions(customerId);
  const contactsQuery = useCustomerContacts(customerId);

  const projectOptions = useMemo(
    () =>
      (projectsQuery.data ?? []).map((project) => ({
        value: String(project.id),
        label: `${project.code} — ${project.name}`,
      })),
    [projectsQuery.data],
  );
  const contactOptions = useMemo(
    () =>
      (contactsQuery.data?.data ?? []).map((contact) => ({
        value: String(contact.id),
        label: contact.position
          ? `${contact.name} (${contact.position})`
          : contact.name,
      })),
    [contactsQuery.data],
  );

  const selectChange =
    (field: "projectId" | "contactId") =>
    (event: React.ChangeEvent<HTMLSelectElement>) =>
      setValue(field, event.target.value, { shouldValidate: true });

  return (
    <div className="grid grid-cols-1 gap-[11px] md:grid-cols-2">
      {request ? (
        // The customer is fixed once the request exists: its project and contact belong to it.
        <FormInput
          label={t("customer")}
          span2
          readOnly
          type="text"
          value={customerLabel(request.customer?.code, request.customer?.name)}
          onChange={() => {}}
        />
      ) : (
        <RequestCustomerPicker
          value={watch("customerId") ?? ""}
          displayLabel={pickedLabel}
          onChange={(customer) => {
            setPickedLabel(customerLabel(customer.code, customer.name));
            setValue("customerId", String(customer.id), {
              shouldValidate: true,
            });
            // A project or contact of the previous customer is no longer a valid choice.
            setValue("projectId", "");
            setValue("contactId", "");
          }}
          onClear={() => {
            setPickedLabel("");
            setValue("customerId", "", { shouldValidate: true });
            setValue("projectId", "");
            setValue("contactId", "");
          }}
          error={errors.customerId?.message}
        />
      )}

      <FormSelect
        label={t("project")}
        options={projectOptions}
        value={watch("projectId") ?? ""}
        onChange={selectChange("projectId")}
        disabled={customerId === 0}
        allowClear
        placeholder={t("placeholders.project")}
        error={errors.projectId?.message}
      />

      <FormSelect
        label={t("contact")}
        options={contactOptions}
        value={watch("contactId") ?? ""}
        onChange={selectChange("contactId")}
        disabled={customerId === 0}
        allowClear
        placeholder={t("placeholders.contact")}
        error={errors.contactId?.message}
      />

      <FormInput
        label={t("titleField")}
        span2
        required
        placeholder={t("placeholders.title")}
        error={errors.title?.message}
        {...register("title")}
      />

      <FormControl
        label={t("requestedDeliveryDate")}
        error={errors.requestedDeliveryDate?.message}
      >
        <DateInput
          value={watch("requestedDeliveryDate") ?? ""}
          onChange={(value) =>
            setValue("requestedDeliveryDate", value, { shouldValidate: true })
          }
          error={Boolean(errors.requestedDeliveryDate)}
        />
      </FormControl>

      <FormControl
        label={t("quotationDueDate")}
        error={errors.quotationDueDate?.message}
      >
        <DateInput
          value={watch("quotationDueDate") ?? ""}
          onChange={(value) =>
            setValue("quotationDueDate", value, { shouldValidate: true })
          }
          error={Boolean(errors.quotationDueDate)}
        />
      </FormControl>

      <FormTextArea
        label={t("technicalRequirements")}
        span2
        placeholder={t("placeholders.technicalRequirements")}
        error={errors.technicalRequirements?.message}
        {...register("technicalRequirements")}
      />
    </div>
  );
}
