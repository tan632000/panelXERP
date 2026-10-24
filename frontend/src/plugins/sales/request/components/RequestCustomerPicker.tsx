"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { FORM_LABEL_TEXT_CLASS } from "@/kernel/core/components/ui/form-label-styles";
import { RecordPickerSourceField } from "@/kernel/core/components/ui/RecordPickerSourceField";

import {
  customerPickerQueryKey,
  fetchCustomerPickerPage,
} from "@plugins/crm/_shared/gateways/customer-gateway";

import type { TableColumn } from "@/kernel/core/components/ui/Table";
import type { Customer } from "@plugins/crm/customer/types";

interface RequestCustomerPickerProps {
  /** Customer id as the form holds it; empty until one is chosen. */
  value: string;
  /** The `code — name` label of the current choice, which the popup cannot supply unopened. */
  displayLabel?: string;
  onChange: (customer: Customer) => void;
  onClear: () => void;
  error?: string;
}

/**
 * Picks the customer of a request. The list behind it is the customers endpoint, which only
 * returns the customers the actor's data scope reaches, so nothing else can be chosen.
 */
export function RequestCustomerPicker({
  value,
  displayLabel,
  onChange,
  onClear,
  error,
}: RequestCustomerPickerProps) {
  const t = useTranslations("request");

  const columns = useMemo<Array<TableColumn<Customer>>>(
    () => [
      { key: "code", header: t("pickerCode"), filterable: false },
      { key: "name", header: t("pickerName"), filterable: false },
    ],
    [t],
  );

  return (
    <div
      className="col-span-2 flex flex-col gap-1"
      data-invalid={error ? true : undefined}
    >
      <div className={`text-sm ${FORM_LABEL_TEXT_CLASS}`}>
        {t("customer")}
        <span className="text-danger-text"> *</span>
      </div>
      <RecordPickerSourceField<Customer>
        value={value}
        displayLabel={displayLabel}
        onChange={onChange}
        onClear={onClear}
        placeholder={t("placeholders.customer")}
        title={t("pickerTitle")}
        searchPlaceholder={t("pickerSearchPlaceholder")}
        emptyText={t("pickerEmpty")}
        columns={columns}
        rowKey={(customer) => String(customer.id)}
        getValue={(customer) => String(customer.id)}
        queryKey={customerPickerQueryKey}
        fetchPage={fetchCustomerPickerPage}
      />
      {error && (
        <span className="mt-0.5 text-xs text-danger-text">{error}</span>
      )}
    </div>
  );
}
