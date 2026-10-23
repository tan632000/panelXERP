"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import React, { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Modal } from "@/kernel/core/components/ui/Modal";
import { useFormApiErrorReporter } from "@/kernel/core/hooks/useFormApiErrorReporter";
import { useNextCodeErrorToast } from "@/kernel/core/hooks/useNextCodeErrorToast";

import {
  useCreateCustomer,
  useNextCustomerCode,
} from "@plugins/crm/customer/hooks/api/useCustomer";
import { useCustomerFormSchema } from "@plugins/crm/customer/hooks/useCustomerFormSchema";
import { toCustomerCreatePayload } from "@plugins/crm/customer/utils/form-payload";
import { mapCustomerApiErrorsToForm } from "@plugins/crm/customer/utils/map-customer-api-errors";

import { CustomerFormFields } from "./CustomerFormFields";

import type {
  CustomerFormInput,
  CustomerFormValues,
} from "@plugins/crm/customer/schemas/customer.schema";

const EMPTY_FORM = {
  code: "",
  name: "",
  taxCode: "",
  address: "",
  phone: "",
  email: "",
  salesOwnerId: "",
  note: "",
} satisfies CustomerFormInput;

interface CreateCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateCustomerModal({
  isOpen,
  onClose,
}: CreateCustomerModalProps) {
  const tModal = useTranslations("modal");
  const tCommon = useTranslations("common");
  const { schema, tValidation } = useCustomerFormSchema();
  const createMutation = useCreateCustomer();
  const nextCodeQuery = useNextCustomerCode(isOpen);
  useNextCodeErrorToast(nextCodeQuery.isError, "customer.toast");

  const form = useForm<CustomerFormInput>({
    resolver: zodResolver(schema) as Resolver<CustomerFormInput>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: EMPTY_FORM,
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({ ...EMPTY_FORM, code: nextCodeQuery.data?.code ?? "" });
  }, [isOpen, nextCodeQuery.data?.code, form]);

  const handleApiError = useFormApiErrorReporter(form, "customer.toast");

  const handleSave = async (data: CustomerFormInput) => {
    try {
      await createMutation.mutateAsync(
        toCustomerCreatePayload(data as CustomerFormValues),
      );
      form.reset();
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
      title={tModal("titles.customer")}
      onSubmit={form.handleSubmit(handleSave)}
      submitLabel={tCommon("save")}
      cancelLabel={tCommon("cancel")}
      wide
    >
      <CustomerFormFields form={form} />
    </Modal>
  );
}
