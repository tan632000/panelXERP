"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import React, { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Modal } from "@/kernel/core/components/ui/Modal";
import { useFormApiErrorReporter } from "@/kernel/core/hooks/useFormApiErrorReporter";

import {
  useCustomer,
  useUpdateCustomer,
} from "@plugins/crm/customer/hooks/api/useCustomer";
import { useCustomerFormSchema } from "@plugins/crm/customer/hooks/useCustomerFormSchema";
import {
  toCustomerFormValues,
  toCustomerUpdatePayload,
} from "@plugins/crm/customer/utils/form-payload";
import { mapCustomerApiErrorsToForm } from "@plugins/crm/customer/utils/map-customer-api-errors";

import { CustomerFormFields } from "./CustomerFormFields";

import type {
  CustomerFormInput,
  CustomerFormValues,
} from "@plugins/crm/customer/schemas/customer.schema";
import type { Customer } from "@plugins/crm/customer/types";

interface EditCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
}

export function EditCustomerModal({
  isOpen,
  onClose,
  customer,
}: EditCustomerModalProps) {
  const t = useTranslations("customer");
  const tCommon = useTranslations("common");
  const { schema, tValidation } = useCustomerFormSchema();
  const updateMutation = useUpdateCustomer();
  const { data: freshCustomer } = useCustomer(customer.id);

  const form = useForm<CustomerFormInput>({
    resolver: zodResolver(schema) as Resolver<CustomerFormInput>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: toCustomerFormValues(customer),
  });

  useEffect(() => {
    if (isOpen) form.reset(toCustomerFormValues(freshCustomer ?? customer));
  }, [isOpen, customer, freshCustomer, form]);

  const handleApiError = useFormApiErrorReporter(form, "customer.toast");

  const handleSave = async (data: CustomerFormInput) => {
    try {
      await updateMutation.mutateAsync({
        id: customer.id,
        data: toCustomerUpdatePayload(data as CustomerFormValues),
      });
      onClose();
    } catch (error: unknown) {
      handleApiError(error, (setFieldError) =>
        mapCustomerApiErrorsToForm(
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
      title={t("editModalTitle", { code: customer.code })}
      onSubmit={form.handleSubmit(handleSave)}
      submitLabel={tCommon("save")}
      cancelLabel={tCommon("cancel")}
      wide
    >
      <CustomerFormFields
        form={form}
        codeLocked
        customer={freshCustomer ?? customer}
      />
    </Modal>
  );
}
