"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { FileInput } from "@/kernel/core/components/ui/FileInput";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { useFormApiErrorReporter } from "@/kernel/core/hooks/useFormApiErrorReporter";
import { toast } from "@/kernel/core/lib/toast";

import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_COUNT,
} from "@plugins/sales/request/constants";
import {
  useCreateRequest,
  useUpdateRequest,
} from "@plugins/sales/request/hooks/api/useRequest";
import { useRequestFormSchema } from "@plugins/sales/request/hooks/useRequestFormSchema";
import { uploadRequestAttachment } from "@plugins/sales/request/services/request.service";
import {
  attachmentFileProblem,
  formatFileSize,
} from "@plugins/sales/request/utils/attachment-file";
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

  // Files picked while creating; they can only be uploaded once the request exists.
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [fileProblem, setFileProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    form.reset(request ? toRequestFormValues(request) : EMPTY_REQUEST_FORM);
    setQueuedFiles([]);
    setFileProblem(null);
  }, [isOpen, request, form]);

  const handleApiError = useFormApiErrorReporter(form, "request.toast");

  const handlePickFile = (file: File) => {
    const rejected = attachmentFileProblem(file);
    if (rejected) {
      setFileProblem(t(`attachments.problems.${rejected}`));
      return;
    }
    setFileProblem(null);
    setQueuedFiles((files) => [...files, file]);
  };

  /**
   * Uploads one file at a time. A failed file never undoes the request: sales can attach it
   * again on the request page, so it is only named in a toast.
   */
  const uploadQueuedFiles = async (requestId: number) => {
    const failedNames: string[] = [];
    for (const file of queuedFiles) {
      try {
        await uploadRequestAttachment(requestId, file);
      } catch {
        failedNames.push(file.name);
      }
    }
    if (failedNames.length > 0) {
      toast.showError(
        t("toast.uploadFailed", { names: failedNames.join(", ") }),
      );
    }
  };

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
        await uploadQueuedFiles(created.id);
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
      // Saving creates the request and then uploads; a second click would create it twice.
      submitDisabled={form.formState.isSubmitting}
      wide
    >
      <RequestFormFields form={form} request={request ?? undefined} />
      {request ? null : (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-semibold text-text-primary">
            {t("attachments.pickAtCreate")}
          </div>
          <FileInput
            chooseLabel={t("attachments.choose")}
            emptyLabel={t("attachments.hint")}
            accept={ATTACHMENT_ACCEPT}
            disabled={queuedFiles.length >= ATTACHMENT_MAX_COUNT}
            onPick={handlePickFile}
          />
          {fileProblem ? (
            <p role="alert" className="text-xs text-danger-text">
              {fileProblem}
            </p>
          ) : null}
          {queuedFiles.length >= ATTACHMENT_MAX_COUNT ? (
            <p className="text-xs text-text-secondary">
              {t("attachments.full", { count: ATTACHMENT_MAX_COUNT })}
            </p>
          ) : null}
          {queuedFiles.length > 0 ? (
            <ul className="divide-y divide-border-secondary rounded-md border border-border-secondary">
              {queuedFiles.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-text-primary">
                    {file.name}{" "}
                    <span className="text-xs text-text-tertiary">
                      · {formatFileSize(file.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={tCommon("delete")}
                    title={tCommon("delete")}
                    className="shrink-0 cursor-pointer text-text-tertiary hover:text-danger-text"
                    onClick={() =>
                      setQueuedFiles((files) =>
                        files.filter((_, at) => at !== index),
                      )
                    }
                  >
                    <Icon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-text-secondary">
            {t("attachments.assignHint")}
          </p>
        </div>
      )}
    </Modal>
  );
}
