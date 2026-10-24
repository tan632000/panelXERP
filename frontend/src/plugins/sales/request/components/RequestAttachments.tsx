"use client";

import { useLocale, useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { FileInput } from "@/kernel/core/components/ui/FileInput";
import { downloadBlob } from "@/kernel/core/lib/download-blob";
import { formatDate } from "@/kernel/core/lib/formatters";
import { toast } from "@/kernel/core/lib/toast";

import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_COUNT,
  REQUEST_ATTACHMENT_OPEN_STATUSES,
  type RequestStatus,
} from "@plugins/sales/request/constants";
import {
  useDeleteRequestAttachment,
  useRequestAttachments,
  useUploadRequestAttachment,
} from "@plugins/sales/request/hooks/api/useRequest";
import { RequestPermission } from "@plugins/sales/request/permissions/request-permission.keys";
import { fetchRequestAttachment } from "@plugins/sales/request/services/request.service";
import {
  attachmentFileProblem,
  formatFileSize,
} from "@plugins/sales/request/utils/attachment-file";

import type { RequestAttachment } from "@plugins/sales/request/types";

interface RequestAttachmentsProps {
  requestId: number;
  status: RequestStatus;
}

/**
 * The drawings and specs of a request. Anyone who can read the request can download them;
 * adding and removing needs `request:update` and a request still open to changes.
 */
export function RequestAttachments({
  requestId,
  status,
}: RequestAttachmentsProps) {
  const t = useTranslations("request");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { can } = useAuth();
  const canChange =
    can(RequestPermission.update) &&
    REQUEST_ATTACHMENT_OPEN_STATUSES.includes(status);

  const attachmentsQuery = useRequestAttachments(requestId);
  const upload = useUploadRequestAttachment(requestId);
  const remove = useDeleteRequestAttachment(requestId);

  const [problem, setProblem] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RequestAttachment | null>(
    null,
  );

  const attachments = attachmentsQuery.data ?? [];
  const full = attachments.length >= ATTACHMENT_MAX_COUNT;

  const handlePick = (file: File) => {
    const rejected = attachmentFileProblem(file);
    if (rejected) {
      setProblem(t(`attachments.problems.${rejected}`));
      return;
    }
    setProblem(null);
    upload.mutate(file);
  };

  const handleDownload = async (attachment: RequestAttachment) => {
    try {
      const blob = await fetchRequestAttachment(requestId, attachment.id);
      downloadBlob(blob, attachment.fileName);
    } catch {
      toast.showError(t("toast.downloadFailed"));
    }
  };

  return (
    <DetailSection
      title={t("attachments.title")}
      action={
        canChange ? (
          <FileInput
            chooseLabel={t("attachments.choose")}
            emptyLabel={t("attachments.hint")}
            accept={ATTACHMENT_ACCEPT}
            disabled={upload.isPending || full}
            onPick={handlePick}
          />
        ) : undefined
      }
    >
      {problem ? (
        <p role="alert" className="mb-2 text-xs text-danger-text">
          {problem}
        </p>
      ) : null}
      {full && canChange ? (
        <p className="mb-2 text-xs text-text-secondary">
          {t("attachments.full", { count: ATTACHMENT_MAX_COUNT })}
        </p>
      ) : null}

      {attachments.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("attachments.empty")}</p>
      ) : (
        <ul className="divide-y divide-border-secondary rounded-md border border-border-secondary">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <div
                  className="truncate text-sm font-semibold text-text-primary"
                  title={attachment.fileName}
                >
                  {attachment.fileName}
                </div>
                <div className="text-xs text-text-tertiary">
                  {formatFileSize(attachment.sizeBytes)} ·{" "}
                  {formatDate(attachment.createdAt, locale)}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <DetailPanelActionButton
                  icon="download"
                  iconOnly
                  aria-label={t("attachments.download")}
                  title={t("attachments.download")}
                  onClick={() => void handleDownload(attachment)}
                />
                {canChange ? (
                  <DetailPanelActionButton
                    variant="danger"
                    icon="trash"
                    iconOnly
                    aria-label={tCommon("delete")}
                    title={tCommon("delete")}
                    onClick={() => setRemoveTarget(attachment)}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title={t("attachments.confirmDeleteTitle")}
        description={t("attachments.confirmDeleteDescription", {
          name: removeTarget?.fileName ?? "",
        })}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        pending={remove.isPending}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return;
          remove.mutate(removeTarget.id, {
            onSettled: () => setRemoveTarget(null),
          });
        }}
      />
    </DetailSection>
  );
}
