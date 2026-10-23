"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";

import { useCustomerOwnerOptions } from "@plugins/crm/customer/hooks/api/useCustomer";

import type { CustomerFormInput } from "@plugins/crm/customer/schemas/customer.schema";
import type { Customer } from "@plugins/crm/customer/types";
import type { UseFormReturn } from "react-hook-form";

interface CustomerFormFieldsProps {
  form: UseFormReturn<CustomerFormInput>;
  /** Edit mode: the code is fixed once the record exists, documents snapshot it. */
  codeLocked?: boolean;
  /** The customer being edited, so its current owner stays selectable. */
  customer?: Customer;
}

export function CustomerFormFields({
  form,
  codeLocked = false,
  customer,
}: CustomerFormFieldsProps) {
  const t = useTranslations("customer");
  const ownerQuery = useCustomerOwnerOptions();

  const {
    register,
    formState: { errors },
    watch,
    setValue,
  } = form;

  const ownerOptions = useMemo(() => {
    const options = (ownerQuery.data ?? []).map((owner) => ({
      value: String(owner.id),
      label: owner.fullName,
    }));
    if (
      customer &&
      !options.some((option) => option.value === String(customer.salesOwnerId))
    ) {
      options.push({
        value: String(customer.salesOwnerId),
        label: customer.salesOwnerName ?? String(customer.salesOwnerId),
      });
    }
    return options;
  }, [ownerQuery.data, customer]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-[11px]">
      <FormInput
        label={codeLocked ? t("code") : t("codeAuto")}
        readOnly={codeLocked}
        type="text"
        required
        placeholder={t("placeholders.code")}
        error={errors.code?.message}
        {...register("code")}
      />

      <FormSelect
        label={t("salesOwner")}
        value={watch("salesOwnerId") ?? ""}
        onChange={(e) =>
          setValue("salesOwnerId", e.target.value, { shouldValidate: true })
        }
        options={[
          // Empty means the server default on create, but "unchanged" on edit.
          {
            value: "",
            label: customer ? t("ownerKeep") : t("ownerDefault"),
          },
          ...ownerOptions,
        ]}
        allowCustomInput={false}
        error={errors.salesOwnerId?.message}
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
  );
}
