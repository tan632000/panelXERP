"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { DetailField } from "@/kernel/core/components/ui/DetailField";
import { DetailFieldGrid } from "@/kernel/core/components/ui/DetailFieldGrid";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
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

import { QuotationOrderSection } from "@plugins/sales/order/components/QuotationOrderSection";
import { quotationPageRoutes } from "@plugins/sales/quotation/constants";
import {
  useQuotation,
  useUpdateQuotationPricing,
} from "@plugins/sales/quotation/hooks/api/useQuotation";
import { QuotationPermission } from "@plugins/sales/quotation/permissions/quotation-permission.keys";
import { quotationFeature } from "@plugins/sales/quotation/quotation.feature";
import { requestPageRoutes } from "@plugins/sales/request/constants";

import { QuotationApprovalPanel } from "./approval/QuotationApprovalPanel";
import { QuotationTermsEditor } from "./approval/QuotationTermsEditor";
import { QuotationFeedbackLog } from "./feedback/QuotationFeedbackLog";
import { QuotationPricingEditor } from "./QuotationPricingEditor";
import { QuotationStatusBadge } from "./QuotationStatusBadge";

export function QuotationDetailPage() {
  const t = useTranslations("quotation");
  const quotationId = useEntityIdParam();
  const { can } = useAuth();

  /** `undefined` follows the latest version; a number pins an older one. */
  const [pinnedVer, setPinnedVer] = useState<number | undefined>();
  const [unsavedPricing, setUnsavedPricing] = useState(false);
  const [unsavedTerms, setUnsavedTerms] = useState(false);

  const quotationQuery = useQuotation(quotationId, pinnedVer);
  const save = useUpdateQuotationPricing(quotationId ?? 0, pinnedVer);

  const quotation = quotationQuery.data;
  const icon = quotationFeature.items[0]?.icon ?? "file-invoice";
  const isMissing =
    !quotationId ||
    isNotFoundError(quotationQuery.error) ||
    (!quotationQuery.isLoading && !quotationQuery.isError && !quotation);

  const listCrumb = {
    label: t("title"),
    href: quotationPageRoutes.list,
    icon,
  };
  const pageHeader = {
    pageTitle: t("title"),
    pageDescription: t("description"),
  };

  const fallback = (() => {
    if (quotationId && quotationQuery.isLoading) {
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
    if (quotationQuery.isError || !quotation) {
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

  if (fallback || !quotation) {
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

  const version = quotation.current;
  const isLatest = version.ver === quotation.latestVer;
  const isDraft = version.status === "draft";
  const editable = can(QuotationPermission.update) && isDraft && isLatest;

  const pinVersion = (key: string) => {
    const next = Number(key);
    setPinnedVer(next === quotation.latestVer ? undefined : next);
  };

  return (
    <DetailPageLayout
      {...pageHeader}
      breadcrumbs={[listCrumb, { label: quotation.code }]}
      title={quotation.code}
      subtitle={quotation.request.title}
    >
      <DetailSection title={t("infoBasic")}>
        <DetailFieldGrid columns={2}>
          <DetailField
            label={t("code")}
            valueClassName="font-mono font-semibold"
          >
            {quotation.code}
          </DetailField>
          <DetailField label={t("version")}>
            <span className="inline-flex items-center gap-2">
              {`v${version.ver}`}
              <QuotationStatusBadge status={version.status} />
            </span>
          </DetailField>
          <DetailField label={t("request")}>
            <Link href={requestPageRoutes.detail(quotation.request.id)}>
              {`${quotation.request.code} — ${quotation.request.title}`}
            </Link>
          </DetailField>
          <DetailField label={t("customer")}>
            {quotation.request.customerName || t("emptyValue")}
          </DetailField>
          <DetailField label={t("salesOwner")}>
            {quotation.request.salesOwnerName || t("emptyValue")}
          </DetailField>
          <DetailField label={t("estimateRevision")}>
            {`#${version.estimateRevision}`}
          </DetailField>
          <DetailField label={t("total")}>
            <span className="font-semibold tabular-nums">
              {formatCurrency(version.total)}
            </span>
          </DetailField>
          {version.createdAt ? (
            <DetailField label={t("createdAt")}>
              {formatIsoDateTime(version.createdAt)}
            </DetailField>
          ) : null}
        </DetailFieldGrid>
        {quotation.versions.length > 1 ? (
          <div className="mt-3">
            <SegmentedTabs
              aria-label={t("versions")}
              activeKey={String(version.ver)}
              onChange={pinVersion}
              items={quotation.versions.map((entry) => ({
                key: String(entry.ver),
                label: `v${entry.ver} · ${t(`statuses.${entry.status}`)}`,
              }))}
            />
          </div>
        ) : null}
        {!isLatest ? (
          <p className="mt-2 text-sm text-text-secondary">
            {t("olderVersion")}
          </p>
        ) : null}
        {isLatest && !isDraft ? (
          <p className="mt-2 text-sm text-text-secondary">
            {t("readOnlyStatus", { status: t(`statuses.${version.status}`) })}
          </p>
        ) : null}
        {isLatest && isDraft && !editable ? (
          <p className="mt-2 text-sm text-text-secondary">
            {t("readOnlyNoRights")}
          </p>
        ) : null}
      </DetailSection>

      <QuotationApprovalPanel
        quotation={quotation}
        unsavedChanges={unsavedPricing || unsavedTerms}
      />

      <QuotationOrderSection
        quotationId={quotation.id}
        versionStatus={version.status}
        isLatest={isLatest}
      />

      <QuotationPricingEditor
        key={`${quotation.id}-${version.id}`}
        version={version}
        editable={editable}
        saving={save.isPending}
        onSave={(dto) => save.mutate(dto)}
        onDirtyChange={setUnsavedPricing}
      />

      <QuotationTermsEditor
        key={`terms-${quotation.id}-${version.id}`}
        version={version}
        editable={editable}
        saving={save.isPending}
        onSave={(terms) => save.mutate({ terms })}
        onDirtyChange={setUnsavedTerms}
      />

      <QuotationFeedbackLog quotationId={quotation.id} />
    </DetailPageLayout>
  );
}

export default QuotationDetailPage;
