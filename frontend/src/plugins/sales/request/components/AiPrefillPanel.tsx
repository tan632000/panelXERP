"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { Link } from "@/kernel/i18n/navigation";

import { estimatePageRoutes } from "@plugins/sales/estimate/constants";
import { EstimatePermission } from "@plugins/sales/estimate/permissions/estimate-permission.keys";
import { useRequestAttachments } from "@plugins/sales/request/hooks/api/useRequest";
import { useAiPrefill } from "@plugins/sales/request/hooks/useAiPrefill";

interface AiPrefillPanelProps {
  requestId: number;
  status: string;
  technicalRequirements?: string | null;
}

/** AI can fill the estimate only while the request is still before engineering work. */
const AI_PREFILL_STATUSES: readonly string[] = ["draft", "assigned"];

/**
 * The "analyse and fill with AI" action of a request. A user without `estimate:ai_prefill`,
 * or a request past the statuses AI may fill, gets nothing at all.
 */
export function AiPrefillPanel(props: Readonly<AiPrefillPanelProps>) {
  const { can } = useAuth();
  if (
    !can(EstimatePermission.aiPrefill) ||
    !AI_PREFILL_STATUSES.includes(props.status)
  ) {
    return null;
  }
  return <AiPrefillBody {...props} />;
}

function AiPrefillBody({
  requestId,
  technicalRequirements,
}: Readonly<AiPrefillPanelProps>) {
  const t = useTranslations("request.ai");
  const tCommon = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  const attachments = useRequestAttachments(requestId);
  const { run, errorKey, start, busy } = useAiPrefill(requestId);

  const hasText = Boolean(technicalRequirements?.trim());
  const hasFile = (attachments.data?.length ?? 0) > 0;
  const hasInput = hasText || hasFile;
  // Claim "no input" only once the file list is known to be empty, not while it loads or fails.
  const noInput = !hasText && attachments.isSuccess && !hasFile;

  return (
    <DetailSection title={t("title")}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">{t("hint")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 rounded-[7px] border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-50"
            disabled={!hasInput || busy}
            onClick={() => setConfirming(true)}
          >
            {t("button")}
          </button>
          {noInput ? (
            <span className="text-sm text-text-secondary">{t("noInput")}</span>
          ) : null}
        </div>

        {run?.status === "queued" ? (
          <p className="text-sm text-text-secondary">{t("queued")}</p>
        ) : null}
        {run?.status === "running" ? (
          <p className="text-sm text-text-secondary">{t("running")}</p>
        ) : null}
        {run?.status === "succeeded" ? (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium text-text-primary">{t("succeeded")}</p>
            {run.summary ? (
              <p className="whitespace-pre-line text-text-secondary">
                {run.summary}
              </p>
            ) : null}
            {run.estimateId ? (
              <Link href={estimatePageRoutes.detail(run.estimateId)}>
                {t("openEstimate")}
              </Link>
            ) : null}
          </div>
        ) : null}
        {run?.status === "failed" ? (
          <p role="alert" className="text-sm text-danger-text">
            {run.error
              ? t("failed", { reason: run.error })
              : t("failedNoReason")}
          </p>
        ) : null}
        {errorKey ? (
          <p role="alert" className="text-sm text-danger-text">
            {t(errorKey)}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        variant="default"
        icon="alert"
        title={t("confirmTitle")}
        description={t("confirmDescription")}
        confirmLabel={t("confirmAction")}
        cancelLabel={tCommon("cancel")}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          start();
        }}
      />
    </DetailSection>
  );
}
