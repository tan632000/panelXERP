"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { ConfirmDialog } from "@/kernel/core/components/ui/ConfirmDialog";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import {
  DETAIL_ACTION_ROW_CLASS,
  DetailPanelActionButton,
} from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { SegmentedTabs } from "@/kernel/core/components/ui/SegmentedTabs";
import { useEntityIdParam } from "@/kernel/core/hooks/useEntityIdParam";
import { isNotFoundError } from "@/kernel/core/lib/api-error-mapping";
import {
  formatCurrency,
  formatIsoDateTime,
} from "@/kernel/core/lib/formatters";
import { Link } from "@/kernel/i18n/navigation";

import { estimatePageRoutes } from "@plugins/sales/estimate/constants";
import { estimateFeature } from "@plugins/sales/estimate/estimate.feature";
import {
  useEstimate,
  useReviseEstimate,
  useSubmitEstimate,
} from "@plugins/sales/estimate/hooks/api/useEstimate";
import { useEstimateEditor } from "@plugins/sales/estimate/hooks/useEstimateEditor";
import { EstimatePermission } from "@plugins/sales/estimate/permissions/estimate-permission.keys";
import { isEstimateWriter } from "@plugins/sales/estimate/utils/estimate-writer";
import { requestPageRoutes } from "@plugins/sales/request/constants";

import { EstimateEditor } from "./EstimateEditor";
import { EstimateStatusBadge } from "./EstimateStatusBadge";

/** Request states in which an estimate may still be edited, submitted or revised. */
const REVISABLE_REQUEST_STATUSES = ["estimating", "estimated"];

export function EstimateDetailPage() {
  const t = useTranslations("estimate");
  const tCommon = useTranslations("common");
  const estimateId = useEntityIdParam();
  const { can, user } = useAuth();

  /** `undefined` follows the latest revision; a number pins an older one. */
  const [pinnedRevision, setPinnedRevision] = useState<number | undefined>();
  const [confirm, setConfirm] = useState<"submit" | "revise" | null>(null);

  const estimateQuery = useEstimate(estimateId, pinnedRevision);
  const editor = useEstimateEditor(estimateId ?? 0, pinnedRevision);
  const submit = useSubmitEstimate();
  const revise = useReviseEstimate();

  const estimate = estimateQuery.data;
  const icon = estimateFeature.items[0]?.icon ?? "calculator";
  const isMissing =
    !estimateId ||
    isNotFoundError(estimateQuery.error) ||
    (!estimateQuery.isLoading && !estimateQuery.isError && !estimate);

  const listCrumb = {
    label: t("title"),
    href: estimatePageRoutes.list,
    icon,
  };
  const pageHeader = {
    pageTitle: t("title"),
    pageDescription: t("description"),
  };

  const fallback = (() => {
    if (estimateId && estimateQuery.isLoading) {
      return <LoadingState variant="list" />;
    }
    if (isMissing) {
      return (
        <EmptyState
          bordered={false}
          icon={icon}
          message={t("detailNotFound")}
        />
      );
    }
    if (estimateQuery.isError || !estimate) {
      return (
        <EmptyState
          bordered={false}
          icon="alert"
          message={t("toast.systemError")}
        />
      );
    }
    return null;
  })();

  if (fallback || !estimate) {
    return (
      <DetailPageLayout
        {...pageHeader}
        breadcrumbs={[listCrumb, { label: t("detailTitle") }]}
        title={t("detailTitle")}
      >
        {fallback}
      </DetailPageLayout>
    );
  }

  const revision = estimate.current;
  const isLatest = revision.revision === estimate.latestRevision;
  const isDraft = revision.status === "draft";
  // Only the assigned engineer and an engineering lead write an estimate, and only while the
  // request is still being estimated; the permission alone (a director's, say) is not enough.
  const isWriter = isEstimateWriter(user, estimate.request.assignedEngineerId);
  const writable =
    isWriter && REVISABLE_REQUEST_STATUSES.includes(estimate.request.status);
  const editable =
    can(EstimatePermission.update) && isDraft && isLatest && writable;

  const complete =
    revision.panels.length > 0 &&
    revision.panels.every((panel) => panel.bomLines.length > 0);
  const canSubmit =
    can(EstimatePermission.submit) && isDraft && isLatest && writable;
  const unsavedBlocker = editor.unsaved ? t("submitBlocked.unsaved") : null;
  const submitBlocker = complete
    ? unsavedBlocker
    : t("submitBlocked.incomplete");
  const canRevise =
    can(EstimatePermission.create) &&
    revision.status === "submitted" &&
    isLatest &&
    writable;

  const pinRevision = (key: string) => {
    const next = Number(key);
    setPinnedRevision(next === estimate.latestRevision ? undefined : next);
  };

  return (
    <>
      <DetailPageLayout
        {...pageHeader}
        breadcrumbs={[listCrumb, { label: estimate.code }]}
        title={estimate.code}
        subtitle={estimate.request.title}
        actions={
          <div className={DETAIL_ACTION_ROW_CLASS}>
            {canSubmit ? (
              <DetailPanelActionButton
                variant="primary"
                icon="check"
                label={t("submit")}
                disabled={submitBlocker !== null || submit.isPending}
                title={submitBlocker ?? undefined}
                onClick={() => setConfirm("submit")}
              />
            ) : null}
            {canRevise ? (
              <DetailPanelActionButton
                icon="copy"
                label={t("revise")}
                disabled={revise.isPending}
                onClick={() => setConfirm("revise")}
              />
            ) : null}
          </div>
        }
      >
        <DetailSection title={t("infoBasic")}>
          <DetailFieldGrid columns={2}>
            <DetailField
              label={t("code")}
              valueClassName="font-mono font-semibold"
            >
              {estimate.code}
            </DetailField>
            <DetailField label={t("revision")}>
              <span className="inline-flex items-center gap-2">
                {`#${revision.revision}`}
                <EstimateStatusBadge status={revision.status} />
              </span>
            </DetailField>
            <DetailField label={t("request")}>
              <Link href={requestPageRoutes.detail(estimate.request.id)}>
                {`${estimate.request.code} — ${estimate.request.title}`}
              </Link>
            </DetailField>
            <DetailField label={t("customer")}>
              {estimate.request.customerName || t("emptyValue")}
            </DetailField>
            <DetailField label={t("assignedEngineer")}>
              {estimate.request.assignedEngineerName || t("emptyValue")}
            </DetailField>
            <DetailField label={t("salesOwner")}>
              {estimate.request.salesOwnerName || t("emptyValue")}
            </DetailField>
            <DetailField label={t("total")}>
              <span className="font-semibold tabular-nums">
                {formatCurrency(revision.total)}
              </span>
            </DetailField>
            {revision.submittedAt ? (
              <DetailField label={t("submittedAt")}>
                {formatIsoDateTime(revision.submittedAt)}
              </DetailField>
            ) : null}
          </DetailFieldGrid>
          {estimate.revisions.length > 1 ? (
            <div className="mt-3">
              <SegmentedTabs
                aria-label={t("revisions")}
                activeKey={String(revision.revision)}
                onChange={pinRevision}
                items={estimate.revisions.map((entry) => ({
                  key: String(entry.revision),
                  label: `#${entry.revision} · ${t(`statuses.${entry.status}`)}`,
                }))}
              />
            </div>
          ) : null}
          {!isLatest ? (
            <p className="mt-2 text-sm text-text-secondary">
              {t("olderRevision")}
            </p>
          ) : null}
          {isLatest && !editable && isDraft ? (
            <p className="mt-2 text-sm text-text-secondary">
              {t("readOnlyNoRights")}
            </p>
          ) : null}
          {revision.status === "submitted" ? (
            <p className="mt-2 text-sm text-text-secondary">
              {t("readOnlySubmitted")}
            </p>
          ) : null}
          {canSubmit && submitBlocker ? (
            <p className="mt-2 text-sm text-warning-text">{submitBlocker}</p>
          ) : null}
        </DetailSection>

        <EstimateEditor
          key={`${estimate.id}-${revision.revision}`}
          revision={revision}
          editor={editor}
          editable={editable}
        />
      </DetailPageLayout>

      <ConfirmDialog
        open={confirm === "submit"}
        variant="default"
        icon="check"
        title={t("confirmSubmitTitle", { code: estimate.code })}
        description={t("confirmSubmitDescription")}
        confirmLabel={t("submit")}
        cancelLabel={tCommon("cancel")}
        pending={submit.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          submit.mutate(estimate.id, {
            onSettled: () => setConfirm(null),
          })
        }
      />
      <ConfirmDialog
        open={confirm === "revise"}
        variant="default"
        icon="copy"
        title={t("confirmReviseTitle", { code: estimate.code })}
        description={t("confirmReviseDescription")}
        confirmLabel={t("revise")}
        cancelLabel={tCommon("cancel")}
        pending={revise.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          revise.mutate(estimate.id, {
            onSuccess: () => setPinnedRevision(undefined),
            onSettled: () => setConfirm(null),
          })
        }
      />
    </>
  );
}

export default EstimateDetailPage;
