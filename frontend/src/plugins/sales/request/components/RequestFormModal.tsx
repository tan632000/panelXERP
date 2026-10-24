"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import React, { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Modal } from "@/kernel/core/components/ui/Modal";
import { useFormApiErrorReporter } from "@/kernel/core/hooks/useFormApiErrorReporter";

import {
  useCreateRequest,
  useUpdateRequest,
} from "@plugins/sales/request/hooks/api/useRequest";
import { useRequestFormSchema } from "@plugins/sales/request/hooks/useRequestFormSchema";
import {
  EMPTY_REQUEST_FORM,
  toRequestCreatePayload,
  toRequestFormValues,
  toRequestUpdatePayload,
} from "@plugins/sales/request/utils/form-payload";
import { mapRequestApiErrorsToForm } from "@plugins/sales/request/utils/map-request-api-errors";

import { RequestFormFields } from "./RequestFormFields";

import type {
  RequestFormInput,
  RequestFormValues,
} from "@plugins/sales/request/schemas/request.schema";
import type { RequestDetail } from "@plugins/sales/request/types";

interface RequestFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The request being edited; absent when creating a new one. */
  request?: RequestDetail | null;
  /** Called with the created request, so the list can open it. */
  onCreated?: (request: RequestDetail) => void;
}

export function RequestFormModal({
  isOpen,
  onClose,
  request,
  onCreated,
}: RequestFormModalProps) {
  const t = useTranslations("request");
  const tCommon = useTranslations("common");
  const { schema, tValidation } = useRequestFormSchema();
  const createMutation = useCreateRequest();
  const updateMutation = useUpdateRequest();

  const form = useForm<RequestFormInput>({
    resolver: zodResolver(schema) as Resolver<RequestFormInput>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: EMPTY_REQUEST_FORM,
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset(request ? toRequestFormValues(request) : EMPTY_REQUEST_FORM);
  }, [isOpen, request, form]);

  const handleApiError = useFormApiErrorReporter(form, "request.toast");

  const handleSave = async (data: RequestFormInput) => {
    const values = data as RequestFormValues;
    try {
      if (request) {
        await updateMutation.mutateAsync({
          id: request.id,
          data: toRequestUpdatePayload(values),
        });
      } else {
        const created = await createMutation.mutateAsync(
          toRequestCreatePayload(values),
        );
        onCreated?.(created);
      }
      onClose();
    } catch (error: unknown) {
      handleApiError(error, (setFieldError) =>
        mapRequestApiErrorsToForm(error, setFieldError, {}, tValidation),
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        request
          ? t("editModalTitle", { code: request.code })
          : t("addModalTitle")
      }
      onSubmit={form.handleSubmit(handleSave)}
      submitLabel={tCommon("save")}
      cancelLabel={tCommon("cancel")}
      wide
    >
      <RequestFormFields form={form} request={request ?? undefined} />
    </Modal>
  );
}
