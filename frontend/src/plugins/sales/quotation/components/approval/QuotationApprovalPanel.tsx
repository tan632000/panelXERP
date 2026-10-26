"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { CancelReasonModal } from "@/kernel/core/components/ui/CancelReasonModal";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { formatIsoDateTime } from "@/kernel/core/lib/formatters";

import {
  QUOTATION_CANCELLABLE_STATUSES,
  QUOTATION_EXPORTABLE_STATUSES,
  QUOTATION_REVISABLE_STATUSES,
  QUOTATION_SUBMIT_ANY_ROLES,
  REASON_MAX,
} from "@plugins/sales/quotation/constants";
import {
  useDownloadQuotation,
  useQuotationAction,
} from "@plugins/sales/quotation/hooks/api/useQuotationApproval";
import { QuotationPermission } from "@plugins/sales/quotation/permissions/quotation-permission.keys";

import type { QuotationDetail } from "@plugins/sales/quotation/types";

interface QuotationApprovalPanelProps {
  quotation: QuotationDetail;
}

/**
 * What the reader can do with the newest version next: hand a draft in, approve or reject it,
 * revise it, record the customer's acceptance, cancel the quotation, and download the
 * customer-facing file. Every control follows the reader's permission; Approve and Reject are
 * absent for someone who cannot approve, and withheld from the version's own creator, whom
 * the server refuses anyway. An older version, pinned for reading, has no actions.
 */
export function QuotationApprovalPanel({
  quotation,
}: QuotationApprovalPanelProps) {
  const t = useTranslations("quotation.approval");
  const tCommon = useTranslations("common");
  const { can, user } = useAuth();
  const [dialog, setDialog] = useState<
    "submit" | "approve" | "reject" | "cancel" | null
  >(null);

  const id = quotation.id;
  const submit = useQuotationAction(id, "submit");
  const approve = useQuotationAction(id, "approve");
  const reject = useQuotationAction(id, "reject");
  const confirm = useQuotationAction(id, "confirm");
  const cancel = useQuotationAction(id, "cancel");
  const revise = useQuotationAction(id, "revise");
  const refresh = useQuotationAction(id, "refresh-estimate");
  const download = useDownloadQuotation(id, quotation.code);

  const version = quotation.current;
  if (version.ver !== quotation.latestVer) return null;

  const { status } = version;
  const stale = Boolean(quotation.estimateStale);
  const isCreator =
    version.createdBy !== null &&
    version.createdBy !== undefined &&
    version.createdBy === user?.id;
  /** Four-eyes: the creator and the last editor of the content never decide on it. */
  const isAuthor =
    isCreator ||
    (version.lastEditedBy !== null &&
      version.lastEditedBy !== undefined &&
      version.lastEditedBy === user?.id);
  const canSubmit =
    can(QuotationPermission.submit) &&
    (isCreator || QUOTATION_SUBMIT_ANY_ROLES.includes(user?.role ?? ""));
  const busy = [submit, approve, reject, confirm, cancel, revise, refresh].some(
    (mutation) => mutation.isPending,
  );

  const canDecide =
    status === "pending_approval" && can(QuotationPermission.approve);
  const canRevise =
    can(QuotationPermission.update) &&
    QUOTATION_REVISABLE_STATUSES.includes(status);
  const canCancel =
    can(QuotationPermission.cancel) &&
    QUOTATION_CANCELLABLE_STATUSES.includes(status);
  const canExport =
    can(QuotationPermission.export) &&
    QUOTATION_EXPORTABLE_STATUSES.includes(status);

  const reasonProps = {
    reasonLabel: t("reason.label"),
    placeholder: t("reason.placeholder"),
    requiredMessage: t("reason.required"),
    maxLengthMessage: t("reason.max", { max: REASON_MAX }),
    maxLength: REASON_MAX,
  };

  return (
    <>
      <DetailSection title={t("title")}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">{t(`hint.${status}`)}</p>

          {status === "draft" && stale ? (
            <p
              role="alert"
              className="rounded-md border border-warning-bg bg-warning-bg px-3 py-2 text-sm text-warning-text"
            >
              {t("stale")}
            </p>
          ) : null}
          {status === "pending_approval" && canDecide && isAuthor ? (
            <p className="text-sm text-text-secondary">
              {t("creatorCannotDecide")}
            </p>
          ) : null}
          {(status === "rejected" || status === "cancelled") &&
          version.decisionReason ? (
            <p className="text-sm">
              <span className="font-semibold">{t(`reasonOf.${status}`)}</span>{" "}
              {version.decisionReason}
              {version.decidedAt
                ? ` (${formatIsoDateTime(version.decidedAt)})`
                : ""}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {status === "draft" && stale && can(QuotationPermission.update) ? (
              <DetailPanelActionButton
                icon="refresh"
                label={t("refresh")}
                disabled={busy}
                onClick={() => refresh.mutate(undefined)}
              />
            ) : null}
            {status === "draft" && canSubmit ? (
              <DetailPanelActionButton
                variant="primary"
                icon="check"
                label={t("submit")}
                disabled={busy || stale}
                title={stale ? t("submitBlockedStale") : undefined}
                onClick={() => setDialog("submit")}
              />
            ) : null}
            {canDecide && !isAuthor ? (
              <>
                <DetailPanelActionButton
                  variant="primary"
                  icon="circle-check"
                  label={t("approve")}
                  disabled={busy}
                  onClick={() => setDialog("approve")}
                />
                <DetailPanelActionButton
                  variant="danger"
                  icon="circle-x"
                  label={t("reject")}
                  disabled={busy}
                  onClick={() => setDialog("reject")}
                />
              </>
            ) : null}
            {status === "approved" && can(QuotationPermission.confirm) ? (
              <DetailPanelActionButton
                variant="primary"
                icon="file-check"
                label={t("confirm")}
                disabled={busy}
                onClick={() => confirm.mutate(undefined)}
              />
            ) : null}
            {canRevise ? (
              <DetailPanelActionButton
                icon="edit"
                label={t("revise")}
                disabled={busy}
                onClick={() => revise.mutate(undefined)}
              />
            ) : null}
            {canExport ? (
              <>
                <DetailPanelActionButton
                  icon="download"
                  label={t("exportXlsx")}
                  disabled={download.isPending}
                  onClick={() => download.mutate("xlsx")}
                />
                <DetailPanelActionButton
                  icon="download"
                  label={t("exportPdf")}
                  disabled={download.isPending}
                  onClick={() => download.mutate("pdf")}
                />
              </>
            ) : null}
            {canCancel ? (
              <DetailPanelActionButton
                variant="danger"
                icon="ban"
                label={t("cancel")}
                disabled={busy}
                onClick={() => setDialog("cancel")}
              />
            ) : null}
          </div>
        </div>
      </DetailSection>

      <ConfirmDialog
        open={dialog === "submit"}
        variant="default"
        icon="check"
        title={t("submitTitle", { code: quotation.code })}
        description={t("submitDescription")}
        confirmLabel={t("submitConfirm")}
        cancelLabel={tCommon("cancel")}
        pending={submit.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          submit.mutate(undefined, { onSettled: () => setDialog(null) })
        }
      />
      <ConfirmDialog
        open={dialog === "approve"}
        variant="default"
        icon="circle-check"
        title={t("approveTitle", { code: quotation.code })}
        description={t("approveDescription")}
        confirmLabel={t("approveConfirm")}
        cancelLabel={tCommon("cancel")}
        pending={approve.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          approve.mutate(undefined, { onSettled: () => setDialog(null) })
        }
      />
      <CancelReasonModal
        isOpen={dialog === "reject"}
        title={t("rejectTitle", { code: quotation.code })}
        description={t("rejectDescription")}
        submitLabel={t("rejectSubmit")}
        pending={reject.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(reason) =>
          reject.mutate(reason, { onSuccess: () => setDialog(null) })
        }
        {...reasonProps}
      />
      <CancelReasonModal
        isOpen={dialog === "cancel"}
        title={t("cancelTitle", { code: quotation.code })}
        description={t("cancelDescription")}
        submitLabel={t("cancelSubmit")}
        pending={cancel.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(reason) =>
          cancel.mutate(reason, { onSuccess: () => setDialog(null) })
        }
        {...reasonProps}
      />
    </>
  );
}
