"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { DateInput } from "@/kernel/core/components/ui/DateInput";
import { FormControl } from "@/kernel/core/components/ui/FormControl";
import { FormInput } from "@/kernel/core/components/ui/FormInput";

import { CONTRACT_NO_MAX } from "@plugins/sales/order/constants";

/** The three header fields of an order as typed; an empty string clears the field. */
export interface ContractFieldValues {
  contractNo: string;
  contractDate: string;
  deliveryDate: string;
}

export const EMPTY_CONTRACT_FIELDS: ContractFieldValues = {
  contractNo: "",
  contractDate: "",
  deliveryDate: "",
};

interface OrderContractFieldsProps {
  values: ContractFieldValues;
  onChange: (values: ContractFieldValues) => void;
  disabled?: boolean;
}

/**
 * Contract number, contract date and delivery date: the only parts of an order that are typed
 * by a person, at conversion and while the order is open.
 */
export function OrderContractFields({
  values,
  onChange,
  disabled = false,
}: OrderContractFieldsProps) {
  const t = useTranslations("order");
  const set = (patch: Partial<ContractFieldValues>) =>
    onChange({ ...values, ...patch });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormInput
        label={t("contractNo")}
        aria-label={t("contractNo")}
        span2
        maxLength={CONTRACT_NO_MAX}
        disabled={disabled}
        value={values.contractNo}
        onChange={(event) => set({ contractNo: event.target.value })}
      />
      <FormControl label={t("contractDate")}>
        <DateInput
          value={values.contractDate}
          disabled={disabled}
          onChange={(value) => set({ contractDate: value })}
        />
      </FormControl>
      <FormControl label={t("deliveryDate")}>
        <DateInput
          value={values.deliveryDate}
          disabled={disabled}
          onChange={(value) => set({ deliveryDate: value })}
        />
      </FormControl>
    </div>
  );
}

/** What the server takes: a blank field is `null`, which clears it. */
export function toOrderHeaderDto(values: ContractFieldValues) {
  return {
    contractNo: values.contractNo.trim() || null,
    contractDate: values.contractDate || null,
    deliveryDate: values.deliveryDate || null,
  };
}
